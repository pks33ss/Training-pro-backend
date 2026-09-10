import { Controller, Get, Post, Put, Body, Param, Request, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceDto, BulkAttendanceDto } from './dto/update-attendance.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ============================================
  // ASISTENCIA POR SESIÓN
  // ============================================

  @Get('session/:sessionId')
  findBySession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.attendanceService.findBySession(req.user.id, sessionId);
  }

  @Get('session/:sessionId/stats')
  getSessionStats(@Request() req, @Param('sessionId') sessionId: string) {
    return this.attendanceService.getSessionStats(req.user.id, sessionId);
  }

  @Post('session/:sessionId/player/:playerId')
  upsertAttendance(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('playerId') playerId: string,
    @Body() updateAttendanceDto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.upsertAttendance(
      req.user.id,
      sessionId,
      playerId,
      updateAttendanceDto.status,
      updateAttendanceDto.notes,
    );
  }

  @Post('session/:sessionId/bulk')
  bulkUpdate(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Body() bulkAttendanceDto: BulkAttendanceDto[],
  ) {
    return this.attendanceService.bulkUpdate(req.user.id, sessionId, bulkAttendanceDto);
  }

  // ============================================
  // HISTORIAL POR JUGADOR
  // ============================================

  @Get('player/:playerId')
  getPlayerAttendance(@Request() req, @Param('playerId') playerId: string) {
    return this.attendanceService.getPlayerAttendance(req.user.id, playerId);
  }

  @Get('player/:playerId/stats')
  getPlayerStats(@Request() req, @Param('playerId') playerId: string) {
    return this.attendanceService.getPlayerStats(req.user.id, playerId);
  }

  // ============================================
  // ESTADÍSTICAS POR EQUIPO
  // ============================================

  @Get('team/:teamId/stats')
  getTeamStats(@Request() req, @Param('teamId') teamId: string) {
    return this.attendanceService.getTeamStats(req.user.id, teamId);
  }
}