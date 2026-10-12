import re

from rest_framework import serializers

from .models import Medication, MedicationLog

TIME_PATTERN = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


class MedicationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    needs_refill = serializers.BooleanField(read_only=True)
    days_of_supply_left = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Medication
        fields = [
            'id', 'user', 'name', 'dosage', 'frequency', 'schedule_times',
            'supply_count', 'refill_threshold', 'notes', 'is_active',
            'needs_refill', 'days_of_supply_left',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Medication name is required.')
        return value

    def validate_dosage(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Dosage is required.')
        return value

    def validate_schedule_times(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Schedule times must be a list of HH:MM strings.')
        times = []
        for item in value:
            if not isinstance(item, str) or not TIME_PATTERN.match(item.strip()):
                raise serializers.ValidationError(f'Invalid time "{item}". Use 24-hour HH:MM format.')
            times.append(item.strip())
        return sorted(set(times))

    def validate_supply_count(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Supply count cannot be negative.')
        return value

    def validate_refill_threshold(self, value):
        if value < 0:
            raise serializers.ValidationError('Refill threshold cannot be negative.')
        return value

    def validate(self, attrs):
        frequency = attrs.get('frequency', getattr(self.instance, 'frequency', 'daily'))
        times = attrs.get('schedule_times', getattr(self.instance, 'schedule_times', []))
        if frequency != 'as_needed' and not times:
            raise serializers.ValidationError({'schedule_times': 'Add at least one dose time.'})
        return attrs


class MedicationLogSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    medication_dosage = serializers.CharField(source='medication.dosage', read_only=True)
    medication_supply_count = serializers.IntegerField(source='medication.supply_count', read_only=True)
    medication_needs_refill = serializers.BooleanField(source='medication.needs_refill', read_only=True)

    class Meta:
        model = MedicationLog
        fields = [
            'id', 'user', 'medication', 'medication_name', 'medication_dosage', 'status',
            'scheduled_time', 'taken_at', 'notes', 'created_at',
            'medication_supply_count', 'medication_needs_refill',
        ]
        read_only_fields = ['id', 'user', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Users can only log doses for their own medications
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['medication'].queryset = Medication.objects.filter(user=request.user)
