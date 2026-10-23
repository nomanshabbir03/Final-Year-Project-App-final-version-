from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .serializers import ProfileSerializer


User = get_user_model()


def _resolve_avatar_url(profile, request=None):
    if profile.avatar_image:
        url = profile.avatar_image.url
        if request:
            return request.build_absolute_uri(url)
        return url
    return profile.avatar_url


def _profile_payload(profile, request=None):
    return {
        'full_name': profile.full_name,
        'avatar_url': _resolve_avatar_url(profile, request=request),
        'bio': profile.bio,
        'selected_city': profile.selected_city,
    }


def _auth_payload(user, request=None):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {
        'email': user.email,
        'user_id': str(profile.external_user_id),
        'full_name': profile.full_name,
        'avatar_url': _resolve_avatar_url(profile, request=request),
        'bio': profile.bio,
        'selected_city': profile.selected_city,
    }


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(_auth_payload(request.user, request=request), status=status.HTTP_200_OK)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = ProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        for field, value in serializer.validated_data.items():
            setattr(profile, field, value)
        profile.save(update_fields=list(serializer.validated_data.keys()))

        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)
