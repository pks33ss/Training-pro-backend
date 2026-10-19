import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
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

  @Get('weekly')
  @ApiOperation({ summary: 'Plan semanal de todos los equipos del usuario' })
  getWeekly(@Request() req, @Query('weekStart') weekStart?: string) {
    const base = weekStart ? new Date(weekStart) : new Date()
    if (isNaN(base.getTime())) {
      throw new BadRequestException('weekStart inválido')
    }
    return this.dashboardService.getMultiTeamWeekly(req.user.id, base)
  }
}