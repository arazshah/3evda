from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cms", "0003_site_home_sections"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="require_two_factor",
            field=models.BooleanField(
                default=False,
                help_text="Ask for the authenticator code after the password when signing in to the panel",
            ),
        ),
    ]
