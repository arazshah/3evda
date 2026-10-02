from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class OwnerAdmin(UserAdmin):  # type: ignore[type-arg]
    def has_add_permission(self, request: object) -> bool:
        return False  # the owner is created only with `manage.py bootstrap_admin`

    def has_delete_permission(self, request: object, obj: object = None) -> bool:
        return False
