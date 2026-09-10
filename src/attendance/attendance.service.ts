import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAttendanceDto, BulkAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // ASISTENCIA POR SESIÓN
  // ============================================

  async findBySession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: session.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a esta sesión');
    }

    const players = await this.prisma.player.findMany({
      where: { teamId: session.teamId, isActive: true },
      orderBy: { lastName: 'asc' },
    });

    const attendances = await this.prisma.attendance.findMany({
      where: { sessionId },
    });

    return players.map((player) => {
      const attendance = attendances.find((a) => a.playerId === player.id);
      return {
        ...player,
        attendance: attendance || null,
      };
    });
  }

  // ============================================
  // MARCAR ASISTENCIA
  // ============================================

  async upsertAttendance(userId: string, sessionId: string, playerId: string, status: string, notes?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: session.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para gestionar asistencias');
    }

    return this.prisma.attendance.upsert({
      where: {
        playerId_sessionId: {
          playerId: playerId,
          sessionId: sessionId,
        },
      },
      update: {
        status: status as any,
        notes: notes,
      },
      create: {
        playerId: playerId,
        sessionId: sessionId,
        status: status as any,
        notes: notes,
      },
    });
  }

  async bulkUpdate(userId: string, sessionId: string, attendances: BulkAttendanceDto[]) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: session.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para gestionar asistencias');
    }

    const results: any[] = []; // ✅ Tipado correcto

    for (const att of attendances) {
      const result = await this.prisma.attendance.upsert({
        where: {
          playerId_sessionId: {
            playerId: att.playerId,
            sessionId: att.sessionId,
          },
        },
        update: {
          status: att.status as any,
          notes: att.notes,
        },
        create: {
          playerId: att.playerId,
          sessionId: att.sessionId,
          status: att.status as any,
          notes: att.notes,
        },
      });
      results.push(result);
    }

    return results;
  }

  // ============================================
  // HISTORIAL DE ASISTENCIA POR JUGADOR
  // ============================================

  async getPlayerAttendance(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: {
            club: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador');
    }

    const attendances = await this.prisma.attendance.findMany({
      where: { playerId },
      include: {
        session: true,
      },
      orderBy: {
        session: {
          date: 'desc',
        },
      },
    });

    return attendances;
  }

  // ============================================
  // ESTADÍSTICAS DE ASISTENCIA POR JUGADOR
  // ============================================

  async getPlayerStats(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: {
            club: true,
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador');
    }

    const attendances = await this.prisma.attendance.findMany({
      where: { playerId },
    });

    const total = attendances.length;
    const present = attendances.filter(a => a.status === 'PRESENT').length;
    const absent = attendances.filter(a => a.status === 'ABSENT').length;
    const late = attendances.filter(a => a.status === 'LATE').length;
    const excused = attendances.filter(a => a.status === 'EXCUSED').length;

    const effectivePresent = present + (late * 0.5) + excused;

    return {
      total,
      present,
      absent,
      late,
      excused,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      effectiveAttendanceRate: total > 0 ? Math.round((effectivePresent / total) * 100) : 0,
    };
  }

  // ============================================
  // ESTADÍSTICAS DE ASISTENCIA POR EQUIPO
  // ============================================

  async getTeamStats(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        club: true,
        players: {
          where: { isActive: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    const playersStats = await Promise.all(
      team.players.map(async (player) => {
        const attendances = await this.prisma.attendance.findMany({
          where: { playerId: player.id },
        });

        const total = attendances.length;
        const present = attendances.filter(a => a.status === 'PRESENT').length;
        const absent = attendances.filter(a => a.status === 'ABSENT').length;
        const late = attendances.filter(a => a.status === 'LATE').length;
        const excused = attendances.filter(a => a.status === 'EXCUSED').length;

        return {
          player: {
            id: player.id,
            name: player.name,
            lastName: player.lastName,
            number: player.number,
            position: player.position,
          },
          stats: {
            total,
            present,
            absent,
            late,
            excused,
            attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
          },
        };
      })
    );

    const totalSessions = await this.prisma.session.count({
      where: { teamId },
    });

    const allAttendances = await this.prisma.attendance.findMany({
      where: {
        session: {
          teamId: teamId,
        },
      },
    });

    const totalAttendances = allAttendances.length;
    const totalPresent = allAttendances.filter(a => a.status === 'PRESENT').length;
    const totalAbsent = allAttendances.filter(a => a.status === 'ABSENT').length;
    const totalLate = allAttendances.filter(a => a.status === 'LATE').length;
    const totalExcused = allAttendances.filter(a => a.status === 'EXCUSED').length;

    return {
      team: {
        id: team.id,
        name: team.name,
        club: team.club.name,
      },
      summary: {
        totalSessions,
        totalPlayers: team.players.length,
        totalAttendances,
        totalPresent,
        totalAbsent,
        totalLate,
        totalExcused,
        attendanceRate: totalAttendances > 0
          ? Math.round((totalPresent / totalAttendances) * 100)
          : 0,
      },
      playersStats: playersStats.sort((a, b) =>
        b.stats.attendanceRate - a.stats.attendanceRate
      ),
    };
  }

  // ============================================
  // ESTADÍSTICAS DE ASISTENCIA POR SESIÓN
  // ============================================

  async getSessionStats(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        team: true,
        attendances: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: session.team.clubId,
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes acceso a esta sesión');
    }

    const totalPlayers = await this.prisma.player.count({
      where: { teamId: session.teamId, isActive: true },
    });

    const present = session.attendances.filter(a => a.status === 'PRESENT').length;
    const absent = session.attendances.filter(a => a.status === 'ABSENT').length;
    const late = session.attendances.filter(a => a.status === 'LATE').length;
    const excused = session.attendances.filter(a => a.status === 'EXCUSED').length;

    return {
      sessionId,
      totalPlayers,
      marked: session.attendances.length,
      pending: totalPlayers - session.attendances.length,
      present,
      absent,
      late,
      excused,
      attendanceRate: totalPlayers > 0 ? Math.round((present / totalPlayers) * 100) : 0,
    };
  }
}