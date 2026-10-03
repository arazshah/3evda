from .blocks import BLOCKS
from .models import ContentBlock


def ensure_blocks() -> int:
    """Create the rows for blocks that exist in the registry but not in the database. Returns how many."""
    existing = set(ContentBlock.objects.values_list("key", flat=True))
    missing = [ContentBlock(key=b.key, text_fa=b.fa, text_en=b.en) for b in BLOCKS if b.key not in existing]
    ContentBlock.objects.bulk_create(missing, ignore_conflicts=True)
    return len(missing)
