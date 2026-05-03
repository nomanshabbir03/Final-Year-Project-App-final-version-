from django.db import models


class Habit(models.Model):
	FREQUENCY_DAILY = 'Daily'
	FREQUENCY_WEEKLY = 'Weekly'

	FREQUENCY_CHOICES = [
		(FREQUENCY_DAILY, 'Daily'),
		(FREQUENCY_WEEKLY, 'Weekly'),
	]

	name = models.CharField(max_length=255)
	frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default=FREQUENCY_DAILY)
	user_id = models.UUIDField(null=True, blank=True, db_index=True)
	streak_count = models.PositiveIntegerField(default=0)
	last_completed_date = models.DateField(null=True, blank=True)

	class Meta:
		ordering = ['-id']

	def __str__(self):
		return self.name
