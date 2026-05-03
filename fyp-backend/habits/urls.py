from django.urls import path

from .views import HabitViewSet

habit_list = HabitViewSet.as_view({'get': 'list', 'post': 'create'})
habit_complete = HabitViewSet.as_view({'patch': 'complete'})

urlpatterns = [
    path('habits/', habit_list, name='habits-list-create'),
    path('habits/<int:pk>/complete/', habit_complete, name='habits-complete'),
]
