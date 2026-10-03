from typing import Any

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from . import attachments
from .models import InquiryAttachment


@receiver(post_delete, sender=InquiryAttachment)
def _remove_file(instance: InquiryAttachment, **kwargs: Any) -> None:
    """A deleted enquiry (or attachment) takes its file with it, once the deletion is committed."""
    key = instance.key
    transaction.on_commit(lambda: attachments.delete(key))
