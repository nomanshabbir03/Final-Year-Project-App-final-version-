from uuid import UUID

from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import UserProfile

from .models import Habit, HabitCompletion
from .serializers import HabitSerializer
from .services import complete_habit


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
	mixins.RetrieveModelMixin,
	mixins.DestroyModelMixin,
	mixins.UpdateModelMixin,
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

	def perform_update(self, serializer):
		# Only allow updating name and frequency fields
		serializer.save(
			name=serializer.validated_data.get('name', serializer.instance.name),
			frequency=serializer.validated_data.get('frequency', serializer.instance.frequency)
		)

	@action(detail=True, methods=['patch'], url_path='complete')
	def complete(self, request, pk=None):
		habit = complete_habit(self.get_object(), timezone.localdate())
		serializer = self.get_serializer(habit)
		return Response(serializer.data, status=status.HTTP_200_OK)

	@action(detail=True, methods=['get'], url_path='history')
	def history(self, request, pk=None):
		habit = self.get_object()
		completions = HabitCompletion.objects.filter(habit=habit).order_by('-completed_date')
		history_data = [
			{
				'completed_date': completion.completed_date
			}
			for completion in completions
		]
		return Response(history_data, status=status.HTTP_200_OK)
