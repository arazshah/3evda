import uuid

from django.db import models


class SampleState(models.Model):
    """Singleton: where the sample content is (loaded or not), for the panel to show and poll."""

    class Status(models.TextChoices):
        EMPTY = "empty", "بارگذاری نشده"
        LOADING = "loading", "در حال بارگذاری"
        LOADED = "loaded", "بارگذاری‌شده"
        UNLOADING = "unloading", "در حال پاک‌سازی"
        FAILED = "failed", "ناموفق"

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EMPTY)
    message = models.CharField(max_length=500, blank=True)
    result = models.JSONField(default=dict, blank=True)
    run_id = models.UUIDField(default=uuid.uuid4, help_text="Lease: only the task holding the current id may write")
    started_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "sample state"

    def __str__(self) -> str:
        return f"sample content: {self.status}"

    @classmethod
    def load(cls) -> "SampleState":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SampleRecord(models.Model):
    """One thing the loader made (`object`) or filled in an existing singleton (`field`), so unloading is exact."""

    class Kind(models.TextChoices):
        OBJECT = "object", "object"
        FIELD = "field", "field"

    kind = models.CharField(max_length=6, choices=Kind.choices)
    model_label = models.CharField(max_length=60)
    object_id = models.CharField(max_length=64)
    field = models.CharField(max_length=64, blank=True)
    value = models.CharField(max_length=300, blank=True, help_text="Field records: what the loader wrote")
    group = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["kind", "model_label"])]

    def __str__(self) -> str:
        return f"{self.kind} {self.model_label}#{self.object_id}"
