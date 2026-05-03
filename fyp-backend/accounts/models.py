import uuid

from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    external_user_id = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    full_name = models.CharField(max_length=120, blank=True)
    avatar_url = models.URLField(blank=True)
    avatar_image = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.CharField(max_length=280, blank=True)
    selected_city = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f'{self.user.username} ({self.external_user_id})'
