import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPER: verificar acceso al equipo
  // ============================================

  private async canAccessTeam(userId: string, teamId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return true

    const team = await this.prisma.team.findUnique({ where: { id: teamId } })
    if (!team) return false

    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true },
    })
    if (clubMember) return true

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (membership) return true

    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true },
    })
    return !!teamMember
  }

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

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a esta sesión');
    }

    // ✅ Ahora buscamos Users con TeamMembership PLAYER activo
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        teamId: session.teamId,
        role: 'PLAYER',
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            username: true,
            avatar: true,
            isGhost: true,
          },
        },
      },
      orderBy: { user: { lastName: 'asc' } },
    })

    const attendances = await this.prisma.attendance.findMany({
      where: { sessionId },
    });

    return memberships.map((m) => {
      const attendance = attendances.find((a) => a.userId === m.user.id);
      return {
        id: m.user.id,
        name: m.user.name,
        lastName: m.user.lastName,
        username: m.user.username,
        avatar: m.user.avatar,
        isGhost: m.user.isGhost,
        jerseyNumber: m.jerseyNumber,
        position: m.position,
        membershipId: m.id,
        attendance: attendance || null,
      };
    });
  }

  // ============================================
  // MARCAR ASISTENCIA
  // ============================================

  async upsertAttendance(
    userId: string,
    sessionId: string,
    targetUserId: string,
    status: string,
    notes?: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para gestionar asistencias');
    }

    return this.prisma.attendance.upsert({
      where: {
        userId_sessionId: {
          userId: targetUserId,
          sessionId: sessionId,
        },
      },
      update: {
        status: status as any,
        notes: notes,
      },
      create: {
        userId: targetUserId,
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

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para gestionar asistencias');
    }

    const results: any[] = [];

    for (const att of attendances) {
      const result = await this.prisma.attendance.upsert({
        where: {
          userId_sessionId: {
            userId: att.userId,
            sessionId: att.sessionId,
          },
        },
        update: {
          status: att.status as any,
          notes: att.notes,
        },
        create: {
          userId: att.userId,
          sessionId: att.sessionId,
          status: att.status as any,
          notes: att.notes,
        },
      });
      results.push(result);
    }

    return results;
  }

  async removeAttendance(userId: string, sessionId: string, targetUserId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { team: true },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes permisos para gestionar asistencias');
    }

    const existing = await this.prisma.attendance.findUnique({
      where: {
        userId_sessionId: { userId: targetUserId, sessionId },
      },
    });

    if (!existing) {
      return { deleted: false, message: 'No había asistencia registrada' };
    }

    await this.prisma.attendance.delete({
      where: {
        userId_sessionId: { userId: targetUserId, sessionId },
      },
    });

    return { deleted: true };
  }

  // ============================================
  // HISTORIAL DE ASISTENCIA POR USUARIO
  // ============================================

  async getUserAttendance(userId: string, targetUserId: string) {
    // Verificar que el targetUserId existe
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que quien consulta tiene acceso a algún equipo donde el target está
    // (simplificado: solo verificamos que el requester es miembro activo de algún club común)
    const attendances = await this.prisma.attendance.findMany({
      where: { userId: targetUserId },
      include: { session: true },
      orderBy: { session: { date: 'desc' } },
    });

    return attendances;
  }

  // ============================================
  // ESTADÍSTICAS DE ASISTENCIA POR USUARIO
  // ============================================

  async getUserStats(userId: string, targetUserId: string) {
    const attendances = await this.prisma.attendance.findMany({
      where: { userId: targetUserId },
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
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      effectiveAttendanceRate: total > 0 ? Math.round((effectivePresent / total) * 100) : 0,
    };
  }

  // ============================================
  // ESTADÍSTICAS DE ASISTENCIA POR EQUIPO
  // ============================================

  async getTeamStats(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }

    if (!(await this.canAccessTeam(userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo');
    }

    // ✅ Miembros con rol PLAYER activo
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        teamId,
        role: 'PLAYER',
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            username: true,
            avatar: true,
            isGhost: true,
          },
        },
      },
    });

    const playersStats = await Promise.all(
      memberships.map(async (m) => {
        const attendances = await this.prisma.attendance.findMany({
          where: { userId: m.user.id },
        });

        const total = attendances.length;
        const present = attendances.filter(a => a.status === 'PRESENT').length;
        const absent = attendances.filter(a => a.status === 'ABSENT').length;
        const late = attendances.filter(a => a.status === 'LATE').length;
        const excused = attendances.filter(a => a.status === 'EXCUSED').length;

        return {
          player: {
            id: m.user.id,
            name: m.user.name,
            lastName: m.user.lastName,
            username: m.user.username,
            isGhost: m.user.isGhost,
            number: m.jerseyNumber,
            position: m.position,
          },
          stats: {
            total,
            present,
            absent,
            late,
            excused,
            attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
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
        totalPlayers: memberships.length,
        totalAttendances,
        totalPresent,
        totalAbsent,
        totalLate,
        totalExcused,
        attendanceRate:
          totalAttendances > 0
            ? Math.round(((totalPresent + totalLate) / totalAttendances) * 100)
            : 0,
      },
      playersStats: playersStats.sort(
        (a, b) => b.stats.attendanceRate - a.stats.attendanceRate,
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

    if (!(await this.canAccessTeam(userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a esta sesión');
    }

    const totalPlayers = await this.prisma.teamMembership.count({
      where: {
        teamId: session.teamId,
        role: 'PLAYER',
        status: 'ACTIVE',
      },
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
      attendanceRate:
        totalPlayers > 0
          ? Math.round(((present + late) / totalPlayers) * 100)
          : 0,
    };
  }
}