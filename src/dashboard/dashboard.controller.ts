// backend/src/dashboard/dashboard.controller.ts
import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import { AuthGuard } from '../auth/auth.guard'

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('team/:teamId')
  @ApiOperation({ summary: 'Obtener resumen del dashboard de un equipo' })
  getTeamSummary(@Request() req, @Param('teamId') teamId: string) {
    return this.dashboardService.getTeamSummary(req.user.id, teamId)
  }
}