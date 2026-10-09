import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments.service';

@Injectable()
export class PaymentRemindersCronService {
  private readonly logger = new Logger(PaymentRemindersCronService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {
    const envFlag = this.config.get<string>('PAYMENT_REMINDERS_ENABLED');
    this.enabled = envFlag === undefined ? true : envFlag === 'true';

    if (!this.enabled) {
      this.logger.warn(
        '⏸️ Recordatorios de pago DESHABILITADOS globalmente (PAYMENT_REMINDERS_ENABLED=false)',
      );
    }
  }

  /**
   * Cron diario a las 9:00 (hora del servidor).
   * Configurable con PAYMENT_REMINDERS_CRON (por defecto: '0 9 * * *').
   */
  @Cron(process.env.PAYMENT_REMINDERS_CRON || '0 9 * * *', {
    name: 'payment-reminders-daily',
  })
  async handleDailyReminders() {
    if (!this.enabled) {
      this.logger.debug(
        'Recordatorios deshabilitados globalmente. Saltando ejecución.',
      );
      return;
    }

    const startedAt = new Date();
    this.logger.log(
      `▶️ Ejecutando recordatorios diarios (${startedAt.toISOString()})`,
    );

    try {
      const clubs = await this.prisma.club.findMany({
        where: { paymentRemindersEnabled: true },
        select: { id: true, name: true },
      });

      if (clubs.length === 0) {
        this.logger.log(
          'ℹ️ Ningún club tiene los recordatorios activados. Fin.',
        );
        return;
      }

      const superAdmin = await this.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN', deletedAt: null },
        select: { id: true },
      });

      if (!superAdmin) {
        this.logger.warn(
          '⚠️ No hay SUPER_ADMIN disponible para ejecutar recordatorios.',
        );
        return;
      }

      let totalConcepts = 0;
      let totalSent = 0;
      let totalSkipped = 0;
      let totalFailed = 0;

      for (const club of clubs) {
        try {
          const result = await this.payments.runReminders(superAdmin.id, {
            clubId: club.id,
            dryRun: false,
          });

          totalConcepts += result.conceptsProcessed;
          totalSent += result.remindersSent;
          totalSkipped += result.remindersSkipped;

          for (const d of result.details) {
            for (const s of d.sentTo) {
              if (s.status === 'failed') totalFailed++;
            }
          }

          this.logger.log(
            `✓ Club "${club.name}": ${result.conceptsProcessed} conceptos, ${result.remindersSent} enviados, ${result.remindersSkipped} omitidos`,
          );
        } catch (err: any) {
          this.logger.error(
            `❌ Error procesando club "${club.name}": ${err?.message ?? err}`,
          );
        }
      }

      const elapsed = Date.now() - startedAt.getTime();
      this.logger.log(
        `✅ Recordatorios completados en ${elapsed}ms · ${clubs.length} clubes, ${totalConcepts} conceptos, ${totalSent} enviados, ${totalSkipped} omitidos, ${totalFailed} fallidos`,
      );
    } catch (err: any) {
      this.logger.error(
        `❌ Error general en recordatorios diarios: ${err?.message ?? err}`,
      );
    }
  }
}