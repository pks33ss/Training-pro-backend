import { Module } from '@nestjs/common';
import { ClubController } from './club.controller';
import { ClubService } from './club.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // ✅ En lugar de importar JwtModule directamente
  controllers: [ClubController],
  providers: [ClubService],
  exports: [ClubService],
})
export class ClubModule {}