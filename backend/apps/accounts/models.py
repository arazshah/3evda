from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q


class User(AbstractUser):
    """The single site owner. The database guarantees that at most one row exists."""

    # unique + always-True check: a second row can never be inserted.
    is_owner = models.BooleanField(default=True, unique=True, editable=False)
    display_name = models.CharField(max_length=150, blank=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(is_owner=True), name="user_is_owner")]

    def __str__(self) -> str:
        return self.display_name or self.username
