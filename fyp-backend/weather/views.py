import json
import os
from uuid import UUID
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from rest_framework import mixins, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.models import UserProfile

from .models import SavedLocation
from .serializers import SavedLocationSerializer


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


class WeatherByCityView(APIView):
	permission_classes = [permissions.IsAuthenticated]

	def get(self, request):
		city = request.query_params.get('city', '').strip()
		if not city:
			return Response(
				{'detail': 'Query parameter "city" is required.'},
				status=status.HTTP_400_BAD_REQUEST,
			)

		api_key = os.getenv('OPENWEATHER_API_KEY')
		if not api_key:
			return Response(
				{'detail': 'Server weather API key is not configured.'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR,
			)

		query = urlencode({'q': city, 'appid': api_key, 'units': 'metric'})
		url = f'https://api.openweathermap.org/data/2.5/weather?{query}'

		try:
			with urlopen(url, timeout=10) as response:
				payload = json.loads(response.read().decode('utf-8'))
		except HTTPError as exc:
			raw = exc.read().decode('utf-8') if exc.fp else '{}'
			try:
				upstream = json.loads(raw)
			except json.JSONDecodeError:
				upstream = {}

			if exc.code == 404:
				return Response(
					{'detail': 'City not found.'},
					status=status.HTTP_404_NOT_FOUND,
				)
			if exc.code == 401:
				return Response(
					{
						'detail': upstream.get(
							'message',
							'Invalid OpenWeatherMap API key on backend.',
						)
					},
					status=status.HTTP_401_UNAUTHORIZED,
				)
			return Response(
				{'detail': upstream.get('message', 'Failed to fetch weather data.')},
				status=status.HTTP_502_BAD_GATEWAY,
			)
		except (URLError, TimeoutError, json.JSONDecodeError):
			return Response(
				{'detail': 'Failed to fetch weather data.'},
				status=status.HTTP_502_BAD_GATEWAY,
			)

		cleaned = {
			'city': payload.get('name') or city,
			'temperature': payload.get('main', {}).get('temp'),
			'temperature_min': payload.get('main', {}).get('temp_min'),
			'temperature_max': payload.get('main', {}).get('temp_max'),
			'condition': payload.get('weather', [{}])[0].get('main'),
			'humidity': payload.get('main', {}).get('humidity'),
		}
		return Response(cleaned, status=status.HTTP_200_OK)


class SavedLocationViewSet(
	mixins.ListModelMixin,
	mixins.CreateModelMixin,
	mixins.DestroyModelMixin,
	viewsets.GenericViewSet,
):
	queryset = SavedLocation.objects.all()
	serializer_class = SavedLocationSerializer
	permission_classes = [permissions.IsAuthenticated]

	def get_queryset(self):
		queryset = super().get_queryset()
		request_user_id = _get_request_user_id(self.request)
		if request_user_id:
			return queryset.filter(user_id=request_user_id)
		return queryset.none()

	def perform_create(self, serializer):
		request_user_id = _get_request_user_id(self.request)
		serializer.save(user_id=request_user_id)
