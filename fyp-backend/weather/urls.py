from django.urls import path

from .views import SavedLocationViewSet, WeatherByCityView

location_list = SavedLocationViewSet.as_view({'get': 'list', 'post': 'create'})
location_detail = SavedLocationViewSet.as_view({'delete': 'destroy'})

urlpatterns = [
    path('weather/', WeatherByCityView.as_view(), name='weather-by-city'),
    path('weather/locations/', location_list, name='weather-location-list-create'),
    path('weather/locations/<int:pk>/', location_detail, name='weather-location-delete'),
]
