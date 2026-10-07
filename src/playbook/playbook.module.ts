import { Module } from '@nestjs/common';
import { PlaybookController } from './playbook.controller';
import { PlaybookService } from './playbook.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlaybookController],
  providers: [PlaybookService],
  exports: [PlaybookService],
})
export class PlaybookModule {}