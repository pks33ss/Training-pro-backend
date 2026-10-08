import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { EmailSettingsService } from './email-settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminController],
  providers: [EmailSettingsService],
  exports: [EmailSettingsService],
})
export class AdminModule {}