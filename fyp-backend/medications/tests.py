from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Medication, MedicationLog


class MedicationApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='a@example.com', email='a@example.com', password='password123')
        self.other = User.objects.create_user(username='b@example.com', email='b@example.com', password='password123')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')

    def _create(self, **overrides):
        payload = {
            'name': 'Paracetamol',
            'dosage': '500mg',
            'frequency': 'twice_daily',
            'schedule_times': ['20:00', '08:00'],
            'supply_count': 10,
            'refill_threshold': 9,
            'notes': 'After meals',
        }
        payload.update(overrides)
        return self.client.post('/medications/', payload, format='json')

    def _log(self, medication_id, status, when='2026-10-12T03:00:00Z'):
        return self.client.post('/medication-logs/', {
            'medication': medication_id,
            'status': status,
            'scheduled_time': when,
        }, format='json')

    # TC-28 / FR-05.1
    def test_add_medication_with_schedule(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['schedule_times'], ['08:00', '20:00'])
        self.assertEqual(response.data['notes'], 'After meals')  # FR-05.5
        self.assertEqual(response.data['days_of_supply_left'], 5)

    def test_rejects_invalid_time_and_missing_times(self):
        self.assertEqual(self._create(schedule_times=['25:00']).status_code, 400)
        self.assertEqual(self._create(schedule_times=[]).status_code, 400)
        self.assertEqual(self._create(frequency='as_needed', schedule_times=[]).status_code, 201)

    def test_medications_are_private_to_each_user(self):
        foreign = Medication.objects.create(user=self.other, name='X', dosage='1', schedule_times=['08:00'])
        self._create()
        response = self.client.get('/medications/')
        self.assertEqual([m['name'] for m in response.data], ['Paracetamol'])
        self.assertEqual(self.client.get(f'/medications/{foreign.id}/').status_code, 404)
        # Cannot log a dose against someone else's medication
        self.assertEqual(self._log(foreign.id, 'taken').status_code, 400)

    # TC-30 / FR-05.3
    def test_logging_same_dose_updates_instead_of_duplicating(self):
        med_id = self._create().data['id']
        self.assertEqual(self._log(med_id, 'deferred').status_code, 201)
        response = self._log(med_id, 'taken')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(MedicationLog.objects.count(), 1)
        self.assertEqual(MedicationLog.objects.get().status, 'taken')

    # TC-32 / FR-05.4
    def test_taken_dose_reduces_supply_and_flags_refill(self):
        med_id = self._create().data['id']
        response = self._log(med_id, 'taken')
        self.assertEqual(response.data['medication_supply_count'], 9)
        self.assertTrue(response.data['medication_needs_refill'])

        # Changing the same dose to skipped gives the unit back
        response = self._log(med_id, 'skipped')
        self.assertEqual(response.data['medication_supply_count'], 10)
        self.assertFalse(response.data['medication_needs_refill'])

    def test_deleting_taken_log_restores_supply(self):
        med_id = self._create().data['id']
        log_id = self._log(med_id, 'taken').data['id']
        self.client.delete(f'/medication-logs/{log_id}/')
        self.assertEqual(Medication.objects.get(pk=med_id).supply_count, 10)

    # UC-07 AF-2
    def test_untracked_supply_never_needs_refill(self):
        response = self._create(supply_count=None)
        self.assertFalse(response.data['needs_refill'])
        log = self._log(response.data['id'], 'taken')
        self.assertIsNone(log.data['medication_supply_count'])

    # TC-33
    def test_history_filters_by_date_range(self):
        med_id = self._create().data['id']
        self._log(med_id, 'taken', '2026-10-10T03:00:00Z')
        self._log(med_id, 'skipped', '2026-10-12T03:00:00Z')
        response = self.client.get('/medication-logs/', {'from': '2026-10-11T00:00:00Z'})
        self.assertEqual([log['status'] for log in response.data], ['skipped'])

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/medications/').status_code, 401)
