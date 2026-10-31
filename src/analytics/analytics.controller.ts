import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  // Endpoint público para registrar cuando se abre la demo
  @Post('demo-open')
  async registerDemoOpen() {
    await this.prisma.appMetricEvent.create({
      data: { type: 'DEMO_OPEN' },
    });
    return { success: true };
  }

  // Endpoint protegido (solo SUPER_ADMIN)
  @Get('dashboard')
  @UseGuards(AuthGuard)
  async getDashboard(@Req() req: any) {
    // Comprobamos el rol manualmente
    if (req.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el superadmin puede ver este dashboard');
    }
    return this.analyticsService.getDashboardData();
  }
}