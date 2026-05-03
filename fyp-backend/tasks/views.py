from uuid import UUID

from rest_framework import mixins, permissions, viewsets
from accounts.models import UserProfile

from .models import Task
from .serializers import TaskSerializer


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


class TaskViewSet(
	mixins.ListModelMixin,
	mixins.CreateModelMixin,
	mixins.DestroyModelMixin,
	viewsets.GenericViewSet,
):
	queryset = Task.objects.all()
	serializer_class = TaskSerializer
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
