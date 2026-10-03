from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django_otp.plugins.otp_static.models import StaticDevice
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.audit.service import record


class Command(BaseCommand):
    help = "Server-side recovery: remove the owner's TOTP and recovery codes and end every session."

    def handle(self, *args: Any, **options: Any) -> None:
        user = get_user_model().objects.first()
        if user is None:
            raise CommandError("No administrator exists.")
        with transaction.atomic():
            TOTPDevice.objects.filter(user=user).delete()
            StaticDevice.objects.filter(user=user).delete()
            Session.objects.all().delete()
            record("admin.mfa_reset", actor=user)
        self.stdout.write(self.style.SUCCESS("MFA removed and sessions ended. TOTP must be enrolled at next sign-in."))
