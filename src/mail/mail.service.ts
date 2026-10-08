import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { renderInvitationEmail, InvitationTemplateData } from './templates/invitation';

interface SendResult {
  sent: boolean;
  reason?: string;
}

const SMTP_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string = '';
  private fromName: string = '';
  private replyTo: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 0);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.fromAddress = this.config.get<string>('SMTP_FROM') ?? '';
    this.fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'Join Sport Management';
    this.replyTo = this.config.get<string>('SMTP_REPLY_TO') ?? null;

    if (!host || !port || !user || !pass || !this.fromAddress) {
      this.logger.warn(
        'SMTP no está configurado (faltan variables). Los emails NO se enviarán.',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      });

      this.logger.log(
        `MailService inicializado: ${this.fromName} <${this.fromAddress}> vía ${host}:${port}` +
          (this.replyTo ? ` (reply-to: ${this.replyTo})` : ''),
      );
    } catch (err: any) {
      this.logger.error(`Error al crear el transporter SMTP: ${err.message}`);
      this.transporter = null;
    }
  }

  async sendInvitationEmail(
    to: string,
    data: InvitationTemplateData,
  ): Promise<SendResult> {
    if (!this.transporter) {
      this.logger.warn(
        `No se envía email de invitación a ${to}: SMTP no configurado.`,
      );
      return { sent: false, reason: 'SMTP not configured' };
    }

    const { subject, html, text } = renderInvitationEmail(data);

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        replyTo: this.replyTo ?? undefined,
        subject,
        html,
        text,
      });

      this.logger.log(
        `✅ Email de invitación enviado a ${to} (id: ${info.messageId})`,
      );
      return { sent: true };
    } catch (err: any) {
      this.logger.error(
        `❌ Error enviando email de invitación a ${to}: ${err.message}`,
      );
      return { sent: false, reason: err.message };
    }
  }
}