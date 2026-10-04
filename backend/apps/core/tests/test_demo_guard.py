import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.blog.models import Article
from apps.booking.models import SessionType
from apps.pricing.models import QuoteRule

pytestmark = pytest.mark.django_db

COMMANDS = ["seed_blog_demo", "seed_quote_demo", "seed_booking_demo"]


@pytest.mark.parametrize("command", COMMANDS)
def test_sample_data_is_refused_on_a_real_site(command, settings):
    settings.ALLOW_DEMO_DATA = False
    with pytest.raises(CommandError) as error:
        call_command(command)
    assert command in str(error.value) and "ALLOW_DEMO_DATA" in str(error.value)


def test_nothing_was_created_when_refused(settings):
    settings.ALLOW_DEMO_DATA = False
    for command in COMMANDS:
        with pytest.raises(CommandError):
            call_command(command)
    assert not Article.objects.exists() and not QuoteRule.objects.exists() and not SessionType.objects.exists()


@pytest.mark.parametrize("command", COMMANDS)
def test_they_run_where_it_is_allowed(command, settings):
    settings.ALLOW_DEMO_DATA = True
    call_command(command)


def test_the_real_content_defaults_command_is_not_a_demo(settings):
    settings.ALLOW_DEMO_DATA = False
    call_command("seed_cms")  # site structure the owner needs, not sample pages
