from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('habits', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='habit',
            name='user_id',
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
