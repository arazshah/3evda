from django.apps import AppConfig


class InquiriesConfig(AppConfig):
    name = "apps.inquiries"
    label = "inquiries"

    def ready(self) -> None:
        from . import signals  # noqa: F401
