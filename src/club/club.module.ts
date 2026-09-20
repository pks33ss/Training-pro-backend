import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClubController } from './club.controller';
import { ClubService } from './club.service';
import { AuthGuard } from '../auth/auth.guard';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

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
    CloudinaryModule,
  ],
  controllers: [ClubController],
  providers: [ClubService, AuthGuard],
  exports: [ClubService],
})
export class ClubModule {}