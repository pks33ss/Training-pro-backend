import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderInvitationEmail, InvitationTemplateData } from './templates/invitation';
import { renderAdminEventEmail, AdminEventData } from './templates/admin-event';

interface SendResult {
  sent: boolean;
  reason?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 15_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private apiKey: string | null = null;
  private fromAddress: string = '';
  private fromName: string = '';
  private replyTo: string | null = null;
  private adminTo: string = 'support@joinsportapp.com';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.config.get<string>('SMTP_PASS') ?? null;
    this.fromAddress = this.config.get<string>('SMTP_FROM') ?? '';
    this.fromName =
      this.config.get<string>('SMTP_FROM_NAME') ?? 'Join Sport Management';
    this.replyTo = this.config.get<string>('SMTP_REPLY_TO') ?? null;
    this.adminTo =
      this.config.get<string>('SMTP_ADMIN_TO') ?? 'support@joinsportapp.com';

    if (!this.apiKey || !this.fromAddress) {
      this.logger.warn(
        'Resend no está configurado (faltan SMTP_PASS o SMTP_FROM). Los emails NO se enviarán.',
      );
      return;
    }

    this.logger.log(
      `MailService inicializado (API HTTPS Resend): ${this.fromName} <${this.fromAddress}>` +
        (this.replyTo ? ` (reply-to: ${this.replyTo})` : '') +
        ` (admin-to: ${this.adminTo})`,
    );
  }

  private async sendViaResend(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<SendResult> {
    if (!this.apiKey) {
      return { sent: false, reason: 'Resend not configured' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

    try {
      const body: Record<string, any> = {
        from: `${this.fromName} <${this.fromAddress}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      };
      if (this.replyTo) body.reply_to = this.replyTo;

      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        let parsed: any = null;
        try {
          parsed = JSON.parse(errorText);
        } catch {}
        const reason = parsed?.message || parsed?.error || `HTTP ${res.status}`;
        this.logger.error(
          `❌ Error enviando email a ${params.to}: ${reason}`,
        );
        return { sent: false, reason };
      }

      const data = await res.json().catch(() => ({}));
      this.logger.log(
        `✅ Email enviado a ${params.to} (id: ${data?.id ?? 'sin id'})`,
      );
      return { sent: true };
    } catch (err: any) {
      const reason =
        err.name === 'AbortError'
          ? 'Connection timeout'
          : err.message || 'Unknown error';
      this.logger.error(
        `❌ Error enviando email a ${params.to}: ${reason}`,
      );
      return { sent: false, reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendInvitationEmail(
    to: string,
    data: InvitationTemplateData,
  ): Promise<SendResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `No se envía email de invitación a ${to}: Resend no configurado.`,
      );
      return { sent: false, reason: 'Resend not configured' };
    }

    const { subject, html, text } = renderInvitationEmail(data);
    return this.sendViaResend({ to, subject, html, text });
  }

  async sendAdminNotification(data: AdminEventData): Promise<SendResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `No se envía notificación admin "${data.eventTitle}": Resend no configurado.`,
      );
      return { sent: false, reason: 'Resend not configured' };
    }

    const { subject, html, text } = renderAdminEventEmail(data);
    return this.sendViaResend({
      to: this.adminTo,
      subject,
      html,
      text,
    });
  }
}