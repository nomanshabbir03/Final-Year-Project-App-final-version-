from django.urls import path

from .views import MeView, ProfileView

# Sign up, sign in, email verification and password reset are handled by Supabase Auth.
urlpatterns = [
    path('me/', MeView.as_view(), name='auth-me'),
    path('profile/', ProfileView.as_view(), name='auth-profile'),
]
