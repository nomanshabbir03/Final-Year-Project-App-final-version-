@echo off
REM Django backend startup script for Windows
REM Binds to 0.0.0.0 to allow external connections from mobile devices

echo Starting Django backend server on 0.0.0.0:8000...
echo This allows mobile devices on your network to connect to the backend
echo.

REM Set environment variables for development
set DJANGO_ALLOWED_HOSTS=*
set CORS_ALLOW_ALL_ORIGINS=True

REM Run the server
python manage.py runserver 0.0.0.0:8000
