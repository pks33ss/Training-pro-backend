// backend/src/match-import/match-import.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { MatchImportService } from './match-import.service'
import { ImportFromSessionDto } from './dto/import-from-session.dto'

@UseGuards(AuthGuard)
@Controller('matches/:id')
export class MatchImportController {
  constructor(private readonly service: MatchImportService) {}

  @Get('import-candidates')
  getCandidates(@Request() req, @Param('id') id: string) {
    return this.service.getCandidates(req.user.id, id)
  }

  @Post('import-from-session')
  importFromSession(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ImportFromSessionDto,
  ) {
    return this.service.importFromSession(req.user.id, id, dto)
  }
}