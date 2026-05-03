from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_profile_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='avatar_image',
            field=models.ImageField(blank=True, null=True, upload_to='avatars/'),
        ),
    ]
