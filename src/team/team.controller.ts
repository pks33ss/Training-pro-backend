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
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('teams')
@UseGuards(AuthGuard, PermissionsGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @RequirePermission('team', 'create', { clubIdFrom: { body: 'clubId' } })
  create(@Request() req, @Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(req.user.id, createTeamDto);
  }

  @Get('club/:clubId')
  @RequirePermission('team', 'view', { clubIdFrom: { param: 'clubId' } })
  findAllByClub(@Request() req, @Param('clubId') clubId: string) {
    return this.teamService.findAllByClub(req.user.id, clubId);
  }

  @Get('club/:clubId/with-members')
  @RequirePermission('team', 'view', { clubIdFrom: { param: 'clubId' } })
  async findAllByClubWithMembers(@Request() req, @Param('clubId') clubId: string) {
    return this.teamService.findAllByClubWithMembers(req.user.id, clubId)
  }

  // El clubId no está en la ruta. La autorización se resuelve dentro del
  // servicio (`canViewTeam` → matriz). No usar @RequirePermission aquí,
  // porque el guard no puede resolver el clubId y denegaría con 403.
  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.teamService.findOne(req.user.id, id);
  }

  @Get(':id/permissions/me')
  getMyPermissions(@Request() req, @Param('id') id: string) {
    return this.teamService.getMyPermissions(req.user.id, id);
  }

  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamService.update(req.user.id, id, updateTeamDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.teamService.remove(req.user.id, id);
  }

  @Post(':id/upload-logo')
  uploadLogo(
    @Request() req,
    @Param('id') id: string,
    @Body('image') image: string,
  ) {
    if (!image) {
      throw new ForbiddenException('Imagen requerida');
    }
    return this.teamService.uploadLogo(req.user.id, id, image);
  }

  @Delete(':id/logo')
  removeLogo(@Request() req, @Param('id') id: string) {
    return this.teamService.removeLogo(req.user.id, id);
  }

  @Get(':id/opponent-players')
  getOpponentPlayers(@Request() req, @Param('id') teamId: string) {
    return this.teamService.getOpponentPlayers(req.user.id, teamId)
  }

}