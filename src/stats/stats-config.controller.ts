import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { PermissionsGuard } from '../permissions/permissions.guard'
import { RequirePermission } from '../permissions/require-permission.decorator'
import { StatsConfigService } from './stats-config.service'
import { UpdateStatsConfigDto } from './dto/update-stats-config.dto'

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('teams')
export class StatsConfigController {
  constructor(private readonly statsConfigService: StatsConfigService) {}

  // ✅ Guía 9.3: Leer config = stats:view
  @Get(':id/stats-config')
  @RequirePermission('report', 'view', { teamIdFrom: { param: 'id' } })
  getConfig(@Request() req, @Param('id') id: string) {
    return this.statsConfigService.getConfig(req.user.id, id)
  }

  // ✅ Guía 9.3: Editar config = stats:edit
  @Put(':id/stats-config')
  @RequirePermission('report', 'edit', { teamIdFrom: { param: 'id' } })
  updateConfig(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateStatsConfigDto,
  ) {
    return this.statsConfigService.updateConfig(req.user.id, id, dto)
  }
}