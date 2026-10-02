"""Brevo transactional API adapter for Django's mail interface."""
from email.utils import parseaddr
import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not settings.BREVO_API_KEY:
            if self.fail_silently:
                return 0
            raise RuntimeError('Brevo is not configured')
        sent = 0
        for message in email_messages:
            if not message.to:
                continue
            name, address = parseaddr(message.from_email)
            try:
                response = requests.post('https://api.brevo.com/v3/smtp/email',
                    headers={'api-key': settings.BREVO_API_KEY, 'Content-Type': 'application/json'},
                    json={'sender': {'email': address, 'name': name or 'Rivebelle'},
                        'to': [{'email': recipient} for recipient in message.to],
                        'subject': message.subject, 'textContent': message.body},
                    timeout=15, allow_redirects=False)
                if response.status_code != 201:
                    # Never include provider response bodies or headers in errors.
                    raise RuntimeError(f'Brevo rejected delivery (HTTP {response.status_code})')
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
