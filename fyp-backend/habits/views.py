from uuid import UUID

from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import UserProfile

from .models import Habit
from .serializers import HabitSerializer


def _get_request_user_id(request):
	if getattr(request, 'user', None) and request.user.is_authenticated:
		profile, _ = UserProfile.objects.get_or_create(user=request.user)
		return profile.external_user_id

	raw = request.headers.get('X-User-Id') or request.query_params.get('user_id')
	if not raw:
		return None

	try:
		return UUID(str(raw))
	except (ValueError, TypeError):
		return None


class HabitViewSet(
	mixins.ListModelMixin,
	mixins.CreateModelMixin,
	viewsets.GenericViewSet,
):
	queryset = Habit.objects.all()
	serializer_class = HabitSerializer
	permission_classes = [permissions.IsAuthenticated]

	def get_queryset(self):
		queryset = super().get_queryset()
		request_user_id = _get_request_user_id(self.request)
		if request_user_id:
			return queryset.filter(user_id=request_user_id)
		return queryset

	def perform_create(self, serializer):
		request_user_id = _get_request_user_id(self.request)
		serializer.save(user_id=request_user_id)

	@action(detail=True, methods=['patch'], url_path='complete')
	def complete(self, request, pk=None):
		habit = self.get_object()
		today = timezone.localdate()

		if habit.last_completed_date == today:
			serializer = self.get_serializer(habit)
			return Response(serializer.data, status=status.HTTP_200_OK)

		if habit.last_completed_date is None:
			habit.streak_count = 1
		else:
			day_delta = (today - habit.last_completed_date).days

			if habit.frequency == Habit.FREQUENCY_DAILY:
				habit.streak_count = habit.streak_count + 1 if day_delta == 1 else 1
			else:
				# Weekly streak: complete within 7 days to keep streak, else reset.
				habit.streak_count = habit.streak_count + 1 if 1 <= day_delta <= 7 else 1

		habit.last_completed_date = today
		habit.save(update_fields=['streak_count', 'last_completed_date'])

		serializer = self.get_serializer(habit)
		return Response(serializer.data, status=status.HTTP_200_OK)
