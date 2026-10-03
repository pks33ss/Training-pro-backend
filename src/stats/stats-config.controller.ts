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
import { StatsConfigService } from './stats-config.service'
import { UpdateStatsConfigDto } from './dto/update-stats-config.dto'

@UseGuards(AuthGuard)
@Controller('teams')
export class StatsConfigController {
  constructor(private readonly statsConfigService: StatsConfigService) {}

  @Get(':id/stats-config')
  getConfig(@Request() req, @Param('id') id: string) {
    return this.statsConfigService.getConfig(req.user.id, id)
  }

  @Put(':id/stats-config')
  updateConfig(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateStatsConfigDto,
  ) {
    return this.statsConfigService.updateConfig(req.user.id, id, dto)
  }
}