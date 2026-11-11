import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderInvitationEmail, InvitationTemplateData } from './templates/invitation';
import { renderAdminEventEmail, AdminEventData } from './templates/admin-event';
import {
  renderPaymentReceivedEmail,
  PaymentReceivedTemplateData,
} from './templates/payment-received';
import {
  renderPaymentReminderEmail,
  PaymentReminderTemplateData,
} from './templates/payment-reminder';

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

  isRealEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    if (!email.includes('@')) return false;
    if (email.endsWith('@joinsportapp.local')) return false;
    return true;
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

  // ─────────────────────────────────────────────
  // PAYMENTS
  // ─────────────────────────────────────────────

  async sendPaymentReceivedEmail(
    to: string,
    data: PaymentReceivedTemplateData,
  ): Promise<SendResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `No se envía email de pago recibido a ${to}: Resend no configurado.`,
      );
      return { sent: false, reason: 'Resend not configured' };
    }
    if (!this.isRealEmail(to)) {
      this.logger.debug(
        `No se envía email de pago recibido a ${to}: email no válido (ghost).`,
      );
      return { sent: false, reason: 'Invalid or ghost email' };
    }

    const { subject, html, text } = renderPaymentReceivedEmail(data);
    return this.sendViaResend({ to, subject, html, text });
  }

  async sendPaymentReminderEmail(
    to: string,
    data: PaymentReminderTemplateData,
  ): Promise<SendResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `No se envía recordatorio de pago a ${to}: Resend no configurado.`,
      );
      return { sent: false, reason: 'Resend not configured' };
    }
    if (!this.isRealEmail(to)) {
      this.logger.debug(
        `No se envía recordatorio de pago a ${to}: email no válido (ghost).`,
      );
      return { sent: false, reason: 'Invalid or ghost email' };
    }

    const { subject, html, text } = renderPaymentReminderEmail(data);
    return this.sendViaResend({ to, subject, html, text });
  }

  // ─────────────────────────────────────────────
  // WELCOME EMAIL
  // ─────────────────────────────────────────────

    async sendWelcomeEmail(to: string, name: string): Promise<SendResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `No se envía email de bienvenida a ${to}: Resend no configurado.`,
      );
      return { sent: false, reason: 'Resend not configured' };
    }
    
    if (!this.isRealEmail(to)) {
      this.logger.debug(
        `No se envía email de bienvenida a ${to}: email no válido (ghost).`,
      );
      return { sent: false, reason: 'Invalid or ghost email' };
    }

    const subject = '¡Bienvenido/a a JoinSport! 🏆 · Welcome to JoinSport!';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="text-align: center; padding: 20px 0;">
          <h1 style="color: #00E676; margin: 0;">JoinSport</h1>
        </div>
        
        <!-- ─── VERSIÓN EN ESPAÑOL ─── -->
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <h2 style="color: #1a1a1a;">¡Hola ${name}!</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            Te damos la bienvenida a <strong>JoinSport</strong>. Estamos encantados de tenerte con nosotros.
          </p>
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            Nuestra misión es ayudarte a gestionar tu club y tus equipos de la forma más profesional y sencilla posible. Esperamos que la aplicación te sea de gran utilidad.
          </p>
          
          <div style="margin: 30px 0;">
            <p style="font-size: 16px; color: #555; margin-bottom: 10px;">
              Síguenos en nuestras redes sociales para estar al día de todas las novedades, mejoras y nuevas funciones que iremos integrando:
            </p>
            <a href="https://instagram.com/joinsportapp" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #E1306C; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Instagram</a>
            <a href="https://x.com/joinsportapp" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #000000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">X (Twitter)</a>
          </div>
          
          <p style="font-size: 14px; color: #888; margin-top: 30px;">
            Si tienes cualquier duda o necesitas ayuda, no dudes en escribirnos a 
            <a href="mailto:support@joinsportapp.com" style="color: #00E676;">support@joinsportapp.com</a>.
          </p>
        </div>

        <!-- SEPARADOR -->
        <hr style="border: none; border-top: 2px dashed #ccc; margin: 30px 0;" />

        <!-- ─── VERSIÓN EN INGLÉS ─── -->
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 8px; text-align: center;">
          <h2 style="color: #1a1a1a;">Hello ${name}!</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            Welcome to <strong>JoinSport</strong>. We are thrilled to have you with us.
          </p>
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            Our mission is to help you manage your club and teams in the most professional and simple way possible. We hope you find the app very useful.
          </p>
          
          <div style="margin: 30px 0;">
            <p style="font-size: 16px; color: #555; margin-bottom: 10px;">
              Follow us on our social media to stay up to date with all the news, improvements, and new features we will be rolling out:
            </p>
            <a href="https://instagram.com/joinsportapp" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #E1306C; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Instagram</a>
            <a href="https://x.com/joinsportapp" style="display: inline-block; margin: 5px; padding: 10px 20px; background-color: #000000; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">X (Twitter)</a>
          </div>
          
          <p style="font-size: 14px; color: #888; margin-top: 30px;">
            If you have any questions or need help, don't hesitate to write to us at 
            <a href="mailto:support@joinsportapp.com" style="color: #00E676;">support@joinsportapp.com</a>.
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; font-size: 12px; color: #aaa;">
          <p>© ${new Date().getFullYear()} JoinSport. Todos los derechos reservados / All rights reserved.</p>
        </div>
      </div>
    `;

    const text = `¡Hola ${name}!\n\nTe damos la bienvenida a JoinSport. Estamos encantados de tenerte con nosotros.\n\nNuestra misión es ayudarte a gestionar tu club y tus equipos de la forma más profesional y sencilla posible.\n\nSíguenos en nuestras redes sociales:\n- Instagram: https://instagram.com/joinsportapp\n- X (Twitter): https://x.com/joinsportapp\n\nSi tienes cualquier duda, escríbenos a support@joinsportapp.com.\n\n-----------------------------------\n\nHello ${name}!\n\nWelcome to JoinSport. We are thrilled to have you with us.\n\nOur mission is to help you manage your club and teams in the most professional and simple way possible.\n\nFollow us on our social media:\n- Instagram: https://instagram.com/joinsportapp\n- X (Twitter): https://x.com/joinsportapp\n\nIf you have any questions, write to us at support@joinsportapp.com.\n\n© ${new Date().getFullYear()} JoinSport. All rights reserved.`;

    return this.sendViaResend({
      to,
      subject,
      html,
      text,
    });
  }
}