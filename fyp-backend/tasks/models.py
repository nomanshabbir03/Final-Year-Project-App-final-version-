from django.db import models


class Task(models.Model):
	PRIORITY_LOW = 'Low'
	PRIORITY_MEDIUM = 'Medium'
	PRIORITY_HIGH = 'High'

	PRIORITY_CHOICES = [
		(PRIORITY_LOW, 'Low'),
		(PRIORITY_MEDIUM, 'Medium'),
		(PRIORITY_HIGH, 'High'),
	]

	title = models.CharField(max_length=255)
	description = models.TextField(blank=True)
	priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
	deadline = models.DateField()
	user_id = models.UUIDField(null=True, blank=True, db_index=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['-created_at']

	def __str__(self):
		return self.title
