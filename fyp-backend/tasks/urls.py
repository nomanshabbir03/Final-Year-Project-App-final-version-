from django.urls import path

from .views import TaskViewSet

task_list = TaskViewSet.as_view({'get': 'list', 'post': 'create'})
task_detail = TaskViewSet.as_view({'delete': 'destroy'})

urlpatterns = [
    path('tasks/', task_list, name='tasks-list-create'),
    path('tasks/<int:pk>/', task_detail, name='tasks-delete'),
]
