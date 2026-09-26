import { Controller, Get, Post, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
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

  // ✅ Cambiado: playerId → userId en las rutas
  @Post('session/:sessionId/user/:userId')
  upsertAttendance(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('userId') targetUserId: string,
    @Body() updateAttendanceDto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.upsertAttendance(
      req.user.id,
      sessionId,
      targetUserId,
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

  @Delete('session/:sessionId/user/:userId')
  removeAttendance(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.attendanceService.removeAttendance(req.user.id, sessionId, targetUserId);
  }

  // ============================================
  // HISTORIAL POR JUGADOR
  // ============================================

  // ✅ Cambiado: /player/:playerId → /user/:userId
  @Get('user/:userId')
  getUserAttendance(@Request() req, @Param('userId') targetUserId: string) {
    return this.attendanceService.getUserAttendance(req.user.id, targetUserId);
  }

  @Get('user/:userId/stats')
  getUserStats(@Request() req, @Param('userId') targetUserId: string) {
    return this.attendanceService.getUserStats(req.user.id, targetUserId);
  }

  // ============================================
  // ESTADÍSTICAS POR EQUIPO
  // ============================================

  @Get('team/:teamId/stats')
  getTeamStats(@Request() req, @Param('teamId') teamId: string) {
    return this.attendanceService.getTeamStats(req.user.id, teamId);
  }
}