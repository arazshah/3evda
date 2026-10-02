import getpass
import os
import sys
from typing import Any

from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.audit.service import record


class Command(BaseCommand):
    help = "Create the single site owner. Refuses to run once an owner exists."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--username", default=os.environ.get("ADMIN_BOOTSTRAP_USERNAME", "admin"))
        parser.add_argument("--email", default="")
        parser.add_argument("--no-input", action="store_true", help="Never prompt; read ADMIN_BOOTSTRAP_PASSWORD.")

    def handle(self, *args: Any, **options: Any) -> None:
        User = get_user_model()
        if User.objects.exists():
            raise CommandError("An administrator already exists; bootstrap can only run once.")

        password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD") or self._prompt(options["no_input"])
        candidate = User(username=options["username"], email=options["email"])
        try:
            password_validation.validate_password(password, candidate)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        with transaction.atomic():
            user = User.objects.create_superuser(options["username"], options["email"], password)
            record("admin.bootstrap", actor=user, username=user.username)

        self.stdout.write(
            self.style.SUCCESS(f"Owner '{user.username}' created.")
            + " Sign in at /panel to enrol TOTP. Remove ADMIN_BOOTSTRAP_PASSWORD from the environment now."
        )

    def _prompt(self, no_input: bool) -> str:
        if no_input or not sys.stdin.isatty():
            raise CommandError("Set ADMIN_BOOTSTRAP_PASSWORD or run interactively.")
        first = getpass.getpass("Password: ")
        if first != getpass.getpass("Password (again): "):
            raise CommandError("Passwords do not match.")
        return first
