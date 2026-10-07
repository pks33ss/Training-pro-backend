import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryExerciseDto } from './dto/create-library-exercise.dto';
import { UpdateLibraryExerciseDto } from './dto/update-library-exercise.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('library-exercises')
@UseGuards(AuthGuard)
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  // ============================================
  // EJERCICIOS
  // ============================================

  @Post()
  create(@Request() req, @Body() dto: CreateLibraryExerciseDto) {
    return this.libraryService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tag') tag?: string,
  ) {
    return this.libraryService.findAll(req.user.id, { q, category, difficulty, tag });
  }

  // ⚠️ MEDIA va ANTES de las rutas con :id para evitar colisiones
  @Delete('media/:mediaId')
  removeMedia(@Request() req, @Param('mediaId') mediaId: string) {
    return this.libraryService.removeMedia(req.user.id, mediaId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.libraryService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateLibraryExerciseDto,
  ) {
    return this.libraryService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.libraryService.remove(req.user.id, id);
  }

  // ============================================
  // MEDIA (los POST no colisionan con :id)
  // ============================================

  @Post(':id/upload-image')
  uploadImage(
    @Request() req,
    @Param('id') id: string,
    @Body('image') image: string,
    @Body('title') title?: string,
  ) {
    return this.libraryService.addMedia(req.user.id, id, image, 'IMAGE', title);
  }

  @Post(':id/add-link')
  addLink(
    @Request() req,
    @Param('id') id: string,
    @Body('url') url: string,
    @Body('title') title?: string,
  ) {
    return this.libraryService.addMedia(req.user.id, id, url, 'LINK', title);
  }
}