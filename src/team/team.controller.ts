import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('teams')
@UseGuards(AuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  create(@Request() req, @Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(req.user.id, createTeamDto);
  }

  @Get('club/:clubId')
  findAllByClub(@Request() req, @Param('clubId') clubId: string) {
    return this.teamService.findAllByClub(req.user.id, clubId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.teamService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamService.update(req.user.id, id, updateTeamDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.teamService.remove(req.user.id, id);
  }


    // ============================================
  // GESTIÓN DE MIEMBROS
  // ============================================

  @Get(':id/members')
  getMembers(@Request() req, @Param('id') id: string) {
    return this.teamService.getMembers(req.user.id, id)
  }

  @Post(':id/invite')
  inviteMember(
    @Request() req,
    @Param('id') id: string,
    @Body('email') email: string,
    @Body('role') role: string,
  ) {
    return this.teamService.inviteMember(req.user.id, id, email, role)
  }

  @Put(':teamId/members/:memberId')
  updateMemberRole(
    @Request() req,
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: string,
  ) {
    return this.teamService.updateMemberRole(req.user.id, teamId, memberId, role)
  }

  @Delete(':teamId/members/:memberId')
  removeMember(
    @Request() req,
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.teamService.removeMember(req.user.id, teamId, memberId)
  }
}