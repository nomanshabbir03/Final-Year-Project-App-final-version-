from django.db import transaction
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Medication, MedicationLog
from .serializers import MedicationSerializer, MedicationLogSerializer


def _adjust_supply(medication, previous_status, new_status):
    """Keep supply_count in step with taken doses (FR-05.4 refill alerts depend on it)."""
    if not medication.tracks_supply or previous_status == new_status:
        return
    if new_status == 'taken':
        medication.supply_count = max(medication.supply_count - 1, 0)
    elif previous_status == 'taken':
        medication.supply_count += 1
    else:
        return
    medication.save(update_fields=['supply_count', 'updated_at'])


class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]
    queryset = Medication.objects.all()

    def get_queryset(self):
        queryset = Medication.objects.filter(user=self.request.user).order_by('-created_at')
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MedicationLogViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationLogSerializer
    permission_classes = [IsAuthenticated]
    queryset = MedicationLog.objects.all()

    def get_queryset(self):
        queryset = (
            MedicationLog.objects.filter(user=self.request.user)
            .select_related('medication')
            .order_by('-scheduled_time', '-created_at')
        )
        params = self.request.query_params
        if params.get('medication'):
            queryset = queryset.filter(medication_id=params['medication'])
        if params.get('status'):
            queryset = queryset.filter(status=params['status'])
        date_from = parse_datetime(params.get('from', '') or '')
        date_to = parse_datetime(params.get('to', '') or '')
        if date_from:
            queryset = queryset.filter(scheduled_time__gte=date_from)
        if date_to:
            queryset = queryset.filter(scheduled_time__lt=date_to)
        return queryset

    def create(self, request, *args, **kwargs):
        """Log a dose. Logging the same dose slot again updates it (e.g. deferred -> taken)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        medication = data['medication']

        with transaction.atomic():
            medication = Medication.objects.select_for_update().get(pk=medication.pk)
            existing = MedicationLog.objects.filter(
                user=request.user,
                medication=medication,
                scheduled_time=data['scheduled_time'],
            ).first()

            if existing:
                previous_status = existing.status
                update = self.get_serializer(existing, data=request.data, partial=True)
                update.is_valid(raise_exception=True)
                log = update.save()
                response_status = status.HTTP_200_OK
            else:
                previous_status = None
                log = serializer.save(user=request.user)
                response_status = status.HTTP_201_CREATED

            _adjust_supply(medication, previous_status, log.status)
            log.medication = medication

        return Response(self.get_serializer(log).data, status=response_status)

    def perform_update(self, serializer):
        with transaction.atomic():
            previous_status = serializer.instance.status
            log = serializer.save()
            medication = Medication.objects.select_for_update().get(pk=log.medication_id)
            _adjust_supply(medication, previous_status, log.status)
            log.medication = medication

    def perform_destroy(self, instance):
        with transaction.atomic():
            medication = Medication.objects.select_for_update().get(pk=instance.medication_id)
            _adjust_supply(medication, instance.status, None)
            instance.delete()
