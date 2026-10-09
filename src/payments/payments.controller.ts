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
  Res,
  Patch,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateConceptDto } from './dto/create-concept.dto';
import { UpdateConceptDto } from './dto/update-concept.dto';
import { ListConceptsDto } from './dto/list-concepts.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { AuthGuard } from '../auth/auth.guard';
import { MyPaymentsQueryDto } from './dto/my-payments-query.dto';
import { AssignPlayersDto } from './dto/assign-players.dto';
import { RunRemindersDto } from './dto/run-reminders.dto';

import { UpdateAssignmentDto } from './dto/update-assignment.dto';

import type { Response } from 'express';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ============================================
  // CONCEPTOS
  // ============================================

  @Post('concepts')
  createConcept(@Request() req, @Body() dto: CreateConceptDto) {
    return this.paymentsService.createConcept(req.user.id, dto);
  }
  // ============================================
  // MIS PAGOS (jugador)
  // ============================================

  @Get('me')
  getMyPayments(@Request() req, @Query() filters: MyPaymentsQueryDto) {
    return this.paymentsService.getMyPayments(req.user.id, filters);
  }


  @Get('concepts')
  listConcepts(@Request() req, @Query() filters: ListConceptsDto) {
    return this.paymentsService.listConcepts(req.user.id, filters);
  }

  @Get('concepts/:id')
  getConcept(@Request() req, @Param('id') id: string) {
    return this.paymentsService.getConceptDetail(req.user.id, id);
  }

  @Put('concepts/:id')
  updateConcept(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateConceptDto,
  ) {
    return this.paymentsService.updateConcept(req.user.id, id, dto);
  }

  @Delete('concepts/:id')
  deleteConcept(@Request() req, @Param('id') id: string) {
    return this.paymentsService.deleteConcept(req.user.id, id);
  }

  // ============================================
  // ASIGNACIÓN POST-CREACIÓN
  // ============================================

  @Post('concepts/:id/assign')
  assignPlayers(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AssignPlayersDto,
  ) {
    return this.paymentsService.assignPlayers(req.user.id, id, dto.userIds);
  }

    @Patch('concepts/:id/assign/:userId')
  updateAssignment(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.paymentsService.updateAssignment(
      req.user.id,
      id,
      targetUserId,
      dto.amountOwed,
    );
  }


  @Delete('concepts/:id/assign/:userId')
  unassignPlayer(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.paymentsService.unassignPlayer(
      req.user.id,
      id,
      targetUserId,
    );
  }

  @Post('concepts/:id/sync-team')
  syncTeam(@Request() req, @Param('id') id: string) {
    return this.paymentsService.syncTeamAssignments(req.user.id, id);
  }


  // ============================================
  // PAGOS
  // ============================================

  @Post()
  createPayment(@Request() req, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(req.user.id, dto);
  }

  @Delete(':id')
  deletePayment(@Request() req, @Param('id') id: string) {
    return this.paymentsService.deletePayment(req.user.id, id);
  }

  // ============================================
  // RESUMEN
  // ============================================

  @Get('summary')
  getSummary(@Request() req, @Query() filters: SummaryQueryDto) {
    return this.paymentsService.getSummary(req.user.id, filters);
  }

  // ============================================
  // UPLOAD DE JUSTIFICANTE
  // ============================================

  @Post('upload-receipt')
  uploadReceipt(@Body('file') file: string) {
    return this.paymentsService.uploadReceipt(file);
  }

  // ============================================
  // RECORDATORIOS
  // ============================================

  @Post('reminders/run')
  runReminders(@Request() req, @Body() dto: RunRemindersDto) {
    return this.paymentsService.runReminders(req.user.id, dto);
  }

    // ============================================
  // RECIBO PDF
  // ============================================

  @Get(':id/receipt.pdf')
  async downloadReceipt(
    @Request() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.paymentsService.generateReceipt(
      id,
      req.user.id,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }


}