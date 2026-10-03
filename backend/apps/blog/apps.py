from django.apps import AppConfig


class BlogConfig(AppConfig):
    name = "apps.blog"
    label = "blog"

    def ready(self) -> None:
        from . import signals  # noqa: F401
