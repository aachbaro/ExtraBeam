import { Injectable } from '@nestjs/common';

export type SendRawEmailParams = {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
};

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

@Injectable()
export class MailerService {
  private readonly apiKey = process.env.BREVO_API_KEY;

  async sendRawEmail({
    to,
    subject,
    html,
    fromName = 'Rivebelle',
    fromEmail = 'notifications@rivebelle.app',
    replyTo,
  }: SendRawEmailParams) {
    if (!this.apiKey) {
      throw new Error("BREVO_API_KEY absente : impossible d'envoyer un e-mail.");
    }

    const payload = {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    };

    const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
    if (typeof fetchFn !== 'function') {
      throw new Error("Fetch API indisponible dans l'environnement d'exécution");
    }

    const res = await fetchFn(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌ Brevo error:', json);
      throw new Error(`Échec envoi email: ${res.status} ${res.statusText}`);
    }

    return json;
  }
}
