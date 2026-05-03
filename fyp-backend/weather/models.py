from django.db import models


class SavedLocation(models.Model):
	user_id = models.UUIDField(db_index=True)
	city = models.CharField(max_length=120)
	label = models.CharField(max_length=120, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['-created_at']
		constraints = [
			models.UniqueConstraint(fields=['user_id', 'city'], name='unique_city_per_user')
		]

	def __str__(self):
		return f'{self.user_id} - {self.city}'
