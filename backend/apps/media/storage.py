from apps.core.storage import PrivateStorage, PublicStorage


def private_storage() -> PrivateStorage:
    return PrivateStorage()


def public_storage() -> PublicStorage:
    return PublicStorage()
