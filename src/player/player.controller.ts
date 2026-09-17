import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { PlayerService } from './player.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('players') // ✅ La ruta debe ser 'players'
@UseGuards(AuthGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Post()
  create(@Request() req, @Body() createPlayerDto: CreatePlayerDto) {
    return this.playerService.create(req.user.id, createPlayerDto);
  }

  @Get('team/:teamId')
  findAllByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.playerService.findAllByTeam(req.user.id, teamId);
  }

  @Post('by-teams')
  findAllByTeams(@Request() req, @Body('teamIds') teamIds: string[]) {
    return this.playerService.findAllByTeams(req.user.id, teamIds)
  }

  
  @Get(':id/match-stats')
  getPlayerMatchStats(@Request() req, @Param('id') id: string) {
    return this.playerService.getPlayerMatchStats(req.user.id, id)
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.playerService.findOne(req.user.id, id);
  }


  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateData: any) {
    return this.playerService.update(req.user.id, id, updateData);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.playerService.remove(req.user.id, id);
  }


  // ============================================
  // TUTORES
  // ============================================

  @Post(':playerId/tutors')
  addTutor(
    @Request() req,
    @Param('playerId') playerId: string,
    @Body() createTutorDto: any,
  ) {
    return this.playerService.addTutor(req.user.id, playerId, createTutorDto)
  }

  @Get(':playerId/tutors')
  getTutors(@Request() req, @Param('playerId') playerId: string) {
    return this.playerService.getTutors(req.user.id, playerId)
  }

  @Put('tutors/:tutorId')
  updateTutor(
    @Request() req,
    @Param('tutorId') tutorId: string,
    @Body() data: any,
  ) {
    return this.playerService.updateTutor(req.user.id, tutorId, data)
  }

  @Delete('tutors/:tutorId')
  removeTutor(@Request() req, @Param('tutorId') tutorId: string) {
    return this.playerService.removeTutor(req.user.id, tutorId)
  }
}