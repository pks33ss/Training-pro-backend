import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { FavoritesController } from './favorites.controller'
import { FavoritesService } from './favorites.service'
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
  controllers: [FavoritesController],
  providers: [FavoritesService, AuthGuard],
  exports: [FavoritesService],
})
export class FavoritesModule {}