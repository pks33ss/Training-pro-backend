import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard } from '../auth/auth.guard'
import { LegalService } from './legal.service'
import { SuperAdminGuard } from './super-admin.guard'
import { UpdateLegalConfigDto } from './dto/update-legal-config.dto'

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  /**
   * GET /api/legal/config — público (sin auth).
   * Lo consume la página /legal/aviso-legal desde el frontend.
   */
  @Get('config')
  async getConfig() {
    return this.legalService.getConfig()
  }

  /**
   * PUT /api/legal/config — solo SUPER_ADMIN.
   * Lo consume el panel /admin/legal.
   */
  @Put('config')
  @UseGuards(AuthGuard, SuperAdminGuard)
  async updateConfig(
    @Body() dto: UpdateLegalConfigDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.legalService.updateConfig(dto, req.user.id)
  }
}