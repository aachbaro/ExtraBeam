import logging
import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections, OperationalError, ProgrammingError
from django.db.models import Q
from django.utils import timezone
from api.models import MissionRequest
from api.recruitment import tick_request
from api.notification_delivery import deliver_pending

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Advance recruitment waves and deliver queued notifications; --loop for the Docker worker.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true')

    def handle(self, *args, **options):
        while True:
            try:
                close_old_connections()
                ids = list(MissionRequest.objects.filter(status__in=['recruiting', 'exhausted']).filter(
                    Q(next_wave_at__lte=timezone.now()) | Q(starts_at__lte=timezone.now())).values_list('pk', flat=True)[:100])
                for pk in ids:
                    tick_request(pk)
                deliver_pending()
            except (OperationalError, ProgrammingError):
                if not options['loop']:
                    raise
                logger.warning('Recruitment worker waiting for database readiness')
            if not options['loop']:
                return
            time.sleep(5)
