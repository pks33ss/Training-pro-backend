import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { ClubModule } from './club/club.module';
import { TeamModule } from './team/team.module';

import { SessionModule } from './session/session.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MatchModule } from './match/match.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LiveModule } from './live/live.module';
import { SeasonModule } from './season/season.module';
import { CalendarModule } from './calendar/calendar.module';
import { FavoritesModule } from './favorites/favorites.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MembershipsModule } from './memberships/memberships.module';
import { TutorRelationshipsModule } from './tutor-relationships/tutor-relationships.module';
import { StatsModule } from './stats/stats.module';
import { HealthModule } from './health/health.module';
import { LibraryModule } from './library/library.module';
import { PlaybookModule } from './playbook/playbook.module';
import { AdminModule } from './admin/admin.module';

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

    SessionModule,
    CalendarModule,
    FavoritesModule,
    AttendanceModule,
    CloudinaryModule,
    MatchModule,
    DashboardModule,
    LiveModule,
    SeasonModule,
    InvitationsModule,
    MembershipsModule,
    TutorRelationshipsModule,
    StatsModule,

    LibraryModule,
    PlaybookModule,

    AdminModule,

    HealthModule,
  ],
})
export class AppModule {}