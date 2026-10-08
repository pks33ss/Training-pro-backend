import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { InvitationsController } from './invitations.controller'
import { PublicInvitationsController } from './public-invitations.controller'
import { InvitationsService } from './invitations.service'
import { AuthGuard } from '../auth/auth.guard'
import { MailModule } from '../mail/mail.module'

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
    MailModule,
  ],
  controllers: [InvitationsController, PublicInvitationsController],
  providers: [InvitationsService, AuthGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}