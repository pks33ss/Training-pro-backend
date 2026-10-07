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
} from '@nestjs/common';
import { PlaybookService } from './playbook.service';
import { CreatePlayDto } from './dto/create-play.dto';
import { UpdatePlayDto } from './dto/update-play.dto';
import { AddStepDto } from './dto/add-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('plays')
@UseGuards(AuthGuard)
export class PlaybookController {
  constructor(private readonly playbookService: PlaybookService) {}

  // ============================================
  // JUGADAS
  // ============================================

  @Post()
  create(@Request() req, @Body() dto: CreatePlayDto) {
    return this.playbookService.create(req.user.id, dto);
  }

  @Get('team/:teamId')
  findAllByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.playbookService.findAllByTeam(req.user.id, teamId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.playbookService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePlayDto,
  ) {
    return this.playbookService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.playbookService.remove(req.user.id, id);
  }

  // ============================================
  // PASOS
  // ============================================

  @Post(':id/steps')
  addStep(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddStepDto,
  ) {
    return this.playbookService.addStep(req.user.id, id, dto);
  }

  @Put(':playId/steps/:stepId')
  updateStep(
    @Request() req,
    @Param('playId') playId: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.playbookService.updateStep(req.user.id, playId, stepId, dto);
  }

  @Delete(':playId/steps/:stepId')
  removeStep(
    @Request() req,
    @Param('playId') playId: string,
    @Param('stepId') stepId: string,
  ) {
    return this.playbookService.removeStep(req.user.id, playId, stepId);
  }

  @Put(':id/reorder')
  reorderSteps(
    @Request() req,
    @Param('id') id: string,
    @Body('stepIds') stepIds: string[],
  ) {
    return this.playbookService.reorderSteps(req.user.id, id, stepIds);
  }
}