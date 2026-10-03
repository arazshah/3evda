import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

User = get_user_model()


@pytest.mark.django_db
def test_only_one_user_can_ever_exist():
    User.objects.create_superuser("owner", password="a-long-password-123")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("second", password="a-long-password-123")


@pytest.mark.django_db
def test_a_non_owner_user_cannot_be_stored():
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("x", password="a-long-password-123", is_owner=False)


@pytest.mark.django_db
def test_owner_can_be_replaced_after_deletion():
    User.objects.create_superuser("owner", password="a-long-password-123").delete()
    User.objects.create_superuser("owner2", password="a-long-password-123")
    assert User.objects.count() == 1
