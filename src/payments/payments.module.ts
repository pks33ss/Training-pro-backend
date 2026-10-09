import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentRemindersCronService } from './cron/payment-reminders.cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuthModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentRemindersCronService],
  exports: [PaymentsService],
})
export class PaymentsModule {}