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
    supabase_user_id = models.UUIDField(null=True, blank=True, unique=True)
    email_confirmed = models.BooleanField(default=False)
    social_provider = models.CharField(max_length=20, blank=True)
    social_subject = models.CharField(max_length=255, blank=True, db_index=True)
    # IANA name sent by the app (e.g. "Asia/Karachi"); dose schedules and "today" use it.
    timezone = models.CharField(max_length=64, blank=True, default='')
    # App preferences: units, notification switches, prayer method, community visibility...
    preferences = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f'{self.user.username} ({self.external_user_id})'


def get_profile(user):
    """The user's profile, created if missing.

    Cached on the user object: the auth classes load it together with the user, so views and
    user_now() reuse it instead of paying another database round trip on every call.
    """
    try:
        return user.profile
    except UserProfile.DoesNotExist:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        user.profile = profile
        return profile


class ConfirmationCode(models.Model):
    email = models.EmailField(db_index=True)
    code = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    used = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.email} - {self.code}'
