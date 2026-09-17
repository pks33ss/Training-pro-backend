import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClubService } from './club.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('clubs')
@Controller('clubs')
@UseGuards(AuthGuard)
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
  findOne(@Request() req, @Param('id') id: string) {
    return this.clubService.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un club' })
  @ApiResponse({ status: 200, description: 'Club actualizado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  update(@Request() req, @Param('id') id: string, @Body() updateClubDto: UpdateClubDto) {
    return this.clubService.update(req.user.id, id, updateClubDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un club' })
  @ApiResponse({ status: 200, description: 'Club eliminado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  remove(@Request() req, @Param('id') id: string) {
    return this.clubService.remove(req.user.id, id);
  }

  
  @ApiOperation({ summary: 'Invitar a un usuario al club' })
  @ApiResponse({ status: 200, description: 'Usuario invitado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
 
    // ============================================
  // GESTIÓN DE MIEMBROS
  // ============================================

  @Get(':id/members')
  getMembers(@Request() req, @Param('id') id: string) {
    return this.clubService.getMembers(req.user.id, id)
  }

  @Post(':id/invite')
  inviteMember(
    @Request() req,
    @Param('id') id: string,
    @Body('email') email: string,
    @Body('role') role: string,
  ) {
    return this.clubService.inviteMember(req.user.id, id, email, role)
  }

  @Put(':clubId/members/:memberId')
  updateMemberRole(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: string,
  ) {
    return this.clubService.updateMemberRole(req.user.id, clubId, memberId, role)
  }

  @Delete(':clubId/members/:memberId')
  removeMember(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.clubService.removeMember(req.user.id, clubId, memberId)
  }
  @Post(':clubId/members/:memberId/reset-password')
  resetMemberPassword(
    @Request() req,
    @Param('clubId') clubId: string,
    @Param('memberId') memberId: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new ForbiddenException('La contraseña debe tener al menos 6 caracteres')
    }

    return this.clubService.resetMemberPassword(
      req.user.id,
      clubId,
      memberId,
      newPassword,
    )
  }
  @Get(':clubId/members/:memberId/teams')
getMemberTeams(
  @Request() req,
  @Param('clubId') clubId: string,
  @Param('memberId') memberId: string,
) {
  return this.clubService.getMemberTeams(req.user.id, clubId, memberId)
}

@Post(':clubId/members/:memberId/teams')
addMemberToTeam(
  @Request() req,
  @Param('clubId') clubId: string,
  @Param('memberId') memberId: string,
  @Body('teamId') teamId: string,
) {
  return this.clubService.addMemberToTeam(req.user.id, clubId, memberId, teamId)
}

@Delete(':clubId/members/:memberId/teams/:teamId')
removeMemberFromTeam(
  @Request() req,
  @Param('clubId') clubId: string,
  @Param('memberId') memberId: string,
  @Param('teamId') teamId: string,
) {
  return this.clubService.removeMemberFromTeam(req.user.id, clubId, memberId, teamId)
}
}