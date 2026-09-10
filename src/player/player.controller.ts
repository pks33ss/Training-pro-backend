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
}