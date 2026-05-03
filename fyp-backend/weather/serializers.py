from rest_framework import serializers

from .models import SavedLocation


class SavedLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedLocation
        fields = ['id', 'city', 'label', 'created_at']
        read_only_fields = ['id', 'created_at']
