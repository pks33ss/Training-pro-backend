import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';
import { AuthGuard } from '../auth/auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { UpdateEmailSettingDto } from './dto/update-email-setting.dto';
import { BulkUpdateEmailSettingsDto } from './dto/bulk-update-email-settings.dto';

@Controller('admin/email-settings')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly emailSettingsService: EmailSettingsService) {}

  @Get()
  listUsers() {
    return this.emailSettingsService.listUsers();
  }

  // ⚠️ `bulk` antes de `:userId` para evitar colisión de rutas
  @Put('bulk')
  updateBulk(@Body() dto: BulkUpdateEmailSettingsDto) {
    return this.emailSettingsService.updateBulk(dto.userIds, dto.enabled);
  }

  @Put(':userId')
  updateOne(
    @Param('userId') userId: string,
    @Body() dto: UpdateEmailSettingDto,
  ) {
    return this.emailSettingsService.updateOne(userId, dto.enabled);
  }
}