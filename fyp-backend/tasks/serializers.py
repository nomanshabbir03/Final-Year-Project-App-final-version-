from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            'id',
            'user_id',
            'title',
            'description',
            'priority',
            'deadline',
            'created_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at']
