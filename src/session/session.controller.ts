import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { AddExerciseDto } from './dto/add-exercise.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ============================================
  // SESIONES
  // ============================================

  @Post()
  create(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    return this.sessionService.create(req.user.id, createSessionDto);
  }

  @Get('team/:teamId')
  findAllByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.sessionService.findAllByTeam(req.user.id, teamId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.sessionService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto) {
    return this.sessionService.update(req.user.id, id, updateSessionDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.sessionService.remove(req.user.id, id);
  }

  // ============================================
  // EJERCICIOS
  // ============================================

  @Post(':id/exercises')
  addExercise(@Request() req, @Param('id') id: string, @Body() addExerciseDto: AddExerciseDto) {
    return this.sessionService.addExercise(req.user.id, id, addExerciseDto);
  }

  @Put('exercises/:exerciseId')
  updateExercise(
    @Request() req,
    @Param('exerciseId') exerciseId: string,
    @Body() updateExerciseDto: any,
  ) {
    return this.sessionService.updateExercise(req.user.id, exerciseId, updateExerciseDto);
  }

  @Put(':id/reorder')
  reorderExercises(
    @Request() req,
    @Param('id') id: string,
    @Body('exerciseIds') exerciseIds: string[],
  ) {
    return this.sessionService.reorderExercises(req.user.id, id, exerciseIds);
  }

  @Delete('exercises/:exerciseId')
  removeExercise(@Request() req, @Param('exerciseId') exerciseId: string) {
    return this.sessionService.removeExercise(req.user.id, exerciseId);
  }

  // ============================================
  // MEDIA (Imágenes y Links)
  // ============================================

  @Post('exercises/:exerciseId/upload-image')
  async uploadExerciseImage(
    @Request() req,
    @Param('exerciseId') exerciseId: string,
    @Body('image') image: string,
    @Body('title') title?: string,
  ) {
    const result = await this.cloudinaryService.uploadImage(image, 'exercises');

    return this.sessionService.addMediaToExercise(
      req.user.id,
      exerciseId,
      result.url,
      'IMAGE',
      title,
    );
  }

  @Post('exercises/:exerciseId/add-link')
  async addExerciseLink(
    @Request() req,
    @Param('exerciseId') exerciseId: string,
    @Body('url') url: string,
    @Body('title') title?: string,
  ) {
    return this.sessionService.addMediaToExercise(
      req.user.id,
      exerciseId,
      url,
      'LINK',
      title,
    );
  }

  @Delete('media/:mediaId')
  async removeMedia(@Request() req, @Param('mediaId') mediaId: string) {
    return this.sessionService.removeMedia(req.user.id, mediaId);
  }
}