import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { ClubModule } from './club/club.module';
import { TeamModule } from './team/team.module';
import { PlayerModule } from './player/player.module';
import { SessionModule } from './session/session.module'; // ✅ UNA SOLA VEZ
import { AttendanceModule } from './attendance/attendance.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MatchModule } from './match/match.module';
import { DashboardModule } from './dashboard/dashboard.module'; // 👈 NUEVO
import { LiveModule } from './live/live.module'; 
import { SeasonModule } from './season/season.module';  // ✅ AÑADIR arriba
import { CalendarModule } from './calendar/calendar.module';  // ✅ NUEVO


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    ClubModule,
    TeamModule,
    PlayerModule,
    SessionModule,
    CalendarModule, // ✅ UNA SOLA VEZ
    AttendanceModule,
    CloudinaryModule,
    MatchModule,
    DashboardModule, // 👈 NUEVO
    LiveModule, 
    SeasonModule, 
  ],
})
export class AppModule {}