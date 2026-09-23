import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TutorRelationshipsController } from './tutor-relationships.controller'
import { TutorRelationshipsService } from './tutor-relationships.service'
import { AuthGuard } from '../auth/auth.guard'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' } as any,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TutorRelationshipsController],
  providers: [TutorRelationshipsService, AuthGuard],
  exports: [TutorRelationshipsService],
})
export class TutorRelationshipsModule {}