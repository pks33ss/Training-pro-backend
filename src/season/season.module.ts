import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SeasonController } from './season.controller'
import { SeasonService } from './season.service'
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
  controllers: [SeasonController],
  providers: [SeasonService, AuthGuard],
  exports: [SeasonService],
})
export class SeasonModule {}