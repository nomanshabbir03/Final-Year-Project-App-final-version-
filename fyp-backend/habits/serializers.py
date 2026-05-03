from rest_framework import serializers

from .models import Habit


class HabitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Habit
        fields = [
            'id',
            'user_id',
            'name',
            'frequency',
            'streak_count',
            'last_completed_date',
        ]
        read_only_fields = ['id', 'user_id', 'streak_count', 'last_completed_date']
