import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClubService } from './club.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { UpdatePaymentRemindersDto } from './dto/update-payment-reminders.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';

@ApiTags('clubs')
@Controller('clubs')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class ClubController {
  constructor(private readonly clubService: ClubService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo club' })
  @ApiResponse({ status: 201, description: 'Club creado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  create(@Request() req, @Body() createClubDto: CreateClubDto) {
    return this.clubService.create(req.user.id, createClubDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los clubs del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de clubs' })
  findAll(@Request() req) {
    return this.clubService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un club por ID' })
  @ApiResponse({ status: 200, description: 'Club encontrado' })
  @ApiResponse({ status: 404, description: 'Club no encontrado' })
  @RequirePermission('club_settings', 'view', { clubIdFrom: { param: 'id' } })
  findOne(@Request() req, @Param('id') id: string) {
    return this.clubService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un club' })
  @ApiResponse({ status: 200, description: 'Club actualizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @RequirePermission('club_settings', 'edit', { clubIdFrom: { param: 'id' } })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateClubDto: UpdateClubDto,
  ) {
    return this.clubService.update(req.user.id, id, updateClubDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un club' })
  @ApiResponse({ status: 200, description: 'Club eliminado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  // Borrar club no está en la matriz: queda solo para ADMIN_CLUB/SUPER_ADMIN
  // vía servicio. No anotamos aquí.
  remove(@Request() req, @Param('id') id: string) {
    return this.clubService.remove(req.user.id, id);
  }

  @Get(':id/members')
  @RequirePermission('member', 'view', { clubIdFrom: { param: 'id' } })
  getMembers(@Request() req, @Param('id') id: string) {
    return this.clubService.getMembers(req.user.id, id);
  }

  @Post(':id/invite')
  @RequirePermission('invitation', 'create', { clubIdFrom: { param: 'id' } })
  inviteMember(
    @Request() req,
    @Param('id') id: string,
    @Body('email') email: string,
    @Body('role') role: string,
  ) {
    return this.clubService.inviteMember(req.user.id, id, email, role);
  }

  @Put(':clubId/members/:memberId')
  @RequirePermission('member', 'edit', { clubIdFrom: { param: 'clubId' } })
  updateMemberRole(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: string,
  ) {
    return this.clubService.updateMemberRole(
      req.user.id,
      clubId,
      memberId,
      role,
    );
  }

  @Delete(':clubId/members/:memberId')
  @RequirePermission('member', 'delete', { clubIdFrom: { param: 'clubId' } })
  removeMember(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.clubService.removeMember(req.user.id, clubId, memberId);
  }

  @Post(':clubId/members/:memberId/reset-password')
  @RequirePermission('member', 'edit', { clubIdFrom: { param: 'clubId' } })
  resetMemberPassword(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new ForbiddenException(
        'La contraseña debe tener al menos 6 caracteres',
      );
    }

    return this.clubService.resetMemberPassword(
      req.user.id,
      clubId,
      memberId,
      newPassword,
    );
  }

  @Get(':clubId/members/:memberId/teams')
  @RequirePermission('member', 'view', { clubIdFrom: { param: 'clubId' } })
  getMemberTeams(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.clubService.getMemberTeams(req.user.id, clubId, memberId);
  }

  @Post(':clubId/members/:memberId/teams')
  @RequirePermission('member', 'edit', { clubIdFrom: { param: 'clubId' } })
  addMemberToTeam(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Body('teamId') teamId: string,
  ) {
    return this.clubService.addMemberToTeam(
      req.user.id,
      clubId,
      memberId,
      teamId,
    );
  }

  @Delete(':clubId/members/:memberId/teams/:teamId')
  @RequirePermission('member', 'edit', { clubIdFrom: { param: 'clubId' } })
  removeMemberFromTeam(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.clubService.removeMemberFromTeam(
      req.user.id,
      clubId,
      memberId,
      teamId,
    );
  }

  @Get(':clubId/players')
  @ApiOperation({ summary: 'Listar todos los jugadores del club' })
  @ApiResponse({ status: 200, description: 'Lista de jugadores' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @RequirePermission('member', 'view', { clubIdFrom: { param: 'clubId' } })
  findClubPlayers(@Request() req, @Param('clubId') clubId: string) {
    return this.clubService.findClubPlayers(req.user.id, clubId);
  }

  @Post(':id/upload-logo')
  @ApiOperation({ summary: 'Subir logo del club (base64)' })
  @RequirePermission('club_branding', 'edit', { clubIdFrom: { param: 'id' } })
  uploadLogo(
    @Request() req,
    @Param('id') id: string,
    @Body('image') image: string,
  ) {
    if (!image) {
      throw new ForbiddenException('Imagen requerida');
    }
    return this.clubService.uploadLogo(req.user.id, id, image);
  }

  @Delete(':id/logo')
  @ApiOperation({ summary: 'Eliminar logo del club' })
  @RequirePermission('club_branding', 'edit', { clubIdFrom: { param: 'id' } })
  removeLogo(@Request() req, @Param('id') id: string) {
    return this.clubService.removeLogo(req.user.id, id);
  }

  @Get(':id/reminders-config')
  @ApiOperation({ summary: 'Obtener configuración de recordatorios de pago' })
  @RequirePermission('club_settings', 'view', { clubIdFrom: { param: 'id' } })
  getRemindersConfig(@Request() req, @Param('id') id: string) {
    return this.clubService.getRemindersConfig(req.user.id, id);
  }

  @Put(':id/payment-reminders')
  @ApiOperation({ summary: 'Activar/desactivar recordatorios de pago' })
  @RequirePermission('club_settings', 'edit', { clubIdFrom: { param: 'id' } })
  updatePaymentReminders(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentRemindersDto,
  ) {
    return this.clubService.updatePaymentReminders(req.user.id, id, dto.enabled);
  }
}