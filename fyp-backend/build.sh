#!/usr/bin/env bash
# Render build step: install packages, collect static files for WhiteNoise and apply migrations.
# Migrations run here because Render's free plan has no pre-deploy command.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input
