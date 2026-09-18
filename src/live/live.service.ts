import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { randomUUID } from 'crypto'

@Injectable()
export class LiveService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  private async getMatchAndUser(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { team: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Usuario no encontrado')

    return { match, user }
  }

  private async verifyMatchAccess(userId: string, matchId: string) {
    const { match, user } = await this.getMatchAndUser(userId, matchId)

    if (user.role === 'SUPER_ADMIN') return match

    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: match.team.clubId, isActive: true },
    })
    if (clubMember) return match

    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId: match.teamId, isActive: true },
    })
    if (teamMember) return match

    const isTutor = await this.prisma.playerTutor.findFirst({
      where: { userId, player: { teamId: match.teamId, isActive: true } },
    })
    if (isTutor) return match

    throw new ForbiddenException('No tienes acceso a este partido')
  }

  private async canManagePermissions(userId: string, matchId: string) {
    const { match, user } = await this.getMatchAndUser(userId, matchId)
    if (user.role === 'SUPER_ADMIN') return true

    const adminClub = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: match.team.clubId, isActive: true, role: 'ADMIN_CLUB' },
    })
    if (adminClub) return true

    const coach = await this.prisma.teamMember.findFirst({
      where: { userId, teamId: match.teamId, isActive: true, role: 'COACH' },
    })
    return !!coach
  }

  private async canUserStream(userId: string, matchId: string, liveStreamId: string) {
    const { user } = await this.getMatchAndUser(userId, matchId)
    if (user.role === 'SUPER_ADMIN') return true

    const permission = await this.prisma.streamPermission.findUnique({
      where: { liveStreamId_userId: { liveStreamId, userId } },
    })
    return permission?.canStream === true
  }

  // ✅ FIX 1: upsert en lugar de find+create (evita race condition)
  private async getOrCreateStream(matchId: string) {
    return this.prisma.liveStream.upsert({
      where: { matchId },
      update: {},
      create: {
        matchId,
        maxUsers: 12,
        streamingEnabled: false,
      },
    })
  }

  // ============================================
  // CANDIDATOS Y PERMISOS
  // ============================================

  async getCandidates(userId: string, matchId: string) {
    if (!(await this.canManagePermissions(userId, matchId))) {
      throw new ForbiddenException('Solo entrenadores y admins pueden gestionar permisos')
    }

    const { match } = await this.getMatchAndUser(userId, matchId)

    const clubMembers = await this.prisma.clubMember.findMany({
      where: { clubId: match.team.clubId, isActive: true },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })
    const teamMembers = await this.prisma.teamMember.findMany({
      where: { teamId: match.teamId, isActive: true },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })
    const tutors = await this.prisma.playerTutor.findMany({
      where: { player: { teamId: match.teamId, isActive: true }, userId: { not: null } },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })

    const map = new Map<string, any>()
    for (const m of clubMembers) {
      map.set(m.user.id, {
        userId: m.user.id, name: m.user.name, lastName: m.user.lastName,
        email: m.user.email, avatar: m.user.avatar, role: `Club · ${m.role}`,
      })
    }
    for (const m of teamMembers) {
      if (map.has(m.user.id)) {
        map.get(m.user.id).role = `Equipo · ${m.role}`
      } else {
        map.set(m.user.id, {
          userId: m.user.id, name: m.user.name, lastName: m.user.lastName,
          email: m.user.email, avatar: m.user.avatar, role: `Equipo · ${m.role}`,
        })
      }
    }
    for (const t of tutors) {
      if (!t.user) continue
      if (!map.has(t.user.id)) {
        map.set(t.user.id, {
          userId: t.user.id, name: t.user.name, lastName: t.user.lastName,
          email: t.user.email, avatar: t.user.avatar, role: `Tutor · ${t.relationship}`,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.lastName.localeCompare(b.lastName))
  }

  async setPermissions(
    userId: string, matchId: string,
    permissions: { userId: string; canStream: boolean }[],
  ) {
    if (!(await this.canManagePermissions(userId, matchId))) {
      throw new ForbiddenException('Solo entrenadores y admins pueden gestionar permisos')
    }
    const stream = await this.getOrCreateStream(matchId)

    await Promise.all(
      permissions.map((p) =>
        this.prisma.streamPermission.upsert({
          where: { liveStreamId_userId: { liveStreamId: stream.id, userId: p.userId } },
          update: { canStream: p.canStream, grantedById: userId, grantedAt: new Date() },
          create: {
            liveStreamId: stream.id, userId: p.userId,
            canStream: p.canStream, grantedById: userId,
          },
        }),
      ),
    )

    return this.prisma.streamPermission.findMany({ where: { liveStreamId: stream.id } })
  }

  async getPermissions(userId: string, matchId: string) {
    if (!(await this.canManagePermissions(userId, matchId))) {
      throw new ForbiddenException('No puedes ver los permisos')
    }
    const stream = await this.getOrCreateStream(matchId)
    return this.prisma.streamPermission.findMany({
      where: { liveStreamId: stream.id },
      include: { user: { select: { id: true, name: true, lastName: true, email: true } } },
    })
  }

  async removePermission(userId: string, matchId: string, targetUserId: string) {
    if (!(await this.canManagePermissions(userId, matchId))) {
      throw new ForbiddenException('No puedes quitar permisos')
    }
    const stream = await this.prisma.liveStream.findUnique({ where: { matchId } })
    if (!stream) return { ok: true }
    await this.prisma.streamPermission.deleteMany({
      where: { liveStreamId: stream.id, userId: targetUserId },
    })
    return { ok: true }
  }

  async setStreamingEnabled(userId: string, matchId: string, enabled: boolean) {
    if (!(await this.canManagePermissions(userId, matchId))) {
      throw new ForbiddenException('Solo entrenadores y admins pueden activar la emisión')
    }
    const stream = await this.getOrCreateStream(matchId)

    if (!enabled && stream.isLive) {
      await this.prisma.liveViewer.deleteMany({ where: { liveStreamId: stream.id } })
      return this.prisma.liveStream.update({
        where: { id: stream.id },
        data: { streamingEnabled: false, isLive: false, endedAt: new Date(), hostId: null, hostPeerId: null },
      })
    }
    return this.prisma.liveStream.update({
      where: { id: stream.id },
      data: { streamingEnabled: enabled },
    })
  }

  // ============================================
  // INFO DEL STREAM (✅ FIX 2: scoreboard siempre presente)
  // ============================================

  async getStreamInfo(userId: string, matchId: string) {
    await this.verifyMatchAccess(userId, matchId)

    // ✅ Forzar que exista el stream (upsert)
    const stream = await this.getOrCreateStream(matchId)

    // Volver a leer con includes
    const fullStream = await this.prisma.liveStream.findUnique({
      where: { id: stream.id },
      include: {
        host: { select: { id: true, name: true, lastName: true } },
        viewers: { include: { user: { select: { id: true, name: true, lastName: true } } } },
      },
    })

    const canManage = await this.canManagePermissions(userId, matchId)
    const myPermission = await this.prisma.streamPermission.findUnique({
      where: { liveStreamId_userId: { liveStreamId: stream.id, userId } },
    })

    return {
      isLive: fullStream!.isLive,
      streamingEnabled: fullStream!.streamingEnabled,
      hostPeerId: fullStream!.hostPeerId,
      hostName: fullStream!.host ? `${fullStream!.host.name} ${fullStream!.host.lastName}` : null,
      viewers: fullStream!.viewers.map((v) => ({
        id: v.id, userId: v.userId,
        name: `${v.user.name} ${v.user.lastName}`,
      })),
      maxUsers: fullStream!.maxUsers,
      startedAt: fullStream!.startedAt,
      canManage,
      myPermission: myPermission?.canStream ?? false,
      scoreboard: {
        enabled: fullStream!.scoreboardEnabled,
        clockEnabled: fullStream!.clockEnabled,
        homeTeamName: fullStream!.homeTeamName,
        awayTeamName: fullStream!.awayTeamName,
        homeScore: fullStream!.homeScore,
        awayScore: fullStream!.awayScore,
        clockSeconds: fullStream!.clockSeconds,
        clockRunning: fullStream!.clockRunning,
        clockDirection: fullStream!.clockDirection,
        clockStartedAt: fullStream!.clockStartedAt,
        clockDuration: fullStream!.clockDuration,
        currentPeriod: fullStream!.currentPeriod,
        isOvertime: fullStream!.isOvertime,
        quarterDuration: fullStream!.quarterDuration,
        overtimeDuration: fullStream!.overtimeDuration,
        customPeriodLabel: fullStream!.customPeriodLabel,
      },
    }
  }

  // ============================================
  // INICIAR / PARAR EMISIÓN
  // ============================================

  async startStream(userId: string, matchId: string) {
    await this.verifyMatchAccess(userId, matchId)
    const stream = await this.getOrCreateStream(matchId)

    if (!stream.streamingEnabled) {
      throw new ForbiddenException('La emisión no está habilitada para este partido')
    }
    if (!(await this.canUserStream(userId, matchId, stream.id))) {
      throw new ForbiddenException('No tienes permiso para emitir este partido')
    }
    if (stream.isLive && stream.hostId !== userId) {
      throw new ForbiddenException('Ya hay una emisión en curso por otro usuario')
    }

    const hostPeerId = `host-${matchId}-${randomUUID().slice(0, 8)}`

    return this.prisma.liveStream.update({
      where: { id: stream.id },
      data: { hostId: userId, hostPeerId, isLive: true, startedAt: new Date(), endedAt: null },
    })
  }

  async stopStream(userId: string, matchId: string) {
    const stream = await this.prisma.liveStream.findUnique({ where: { matchId } })
    if (!stream) throw new NotFoundException('No hay emisión activa')

    const { user } = await this.getMatchAndUser(userId, matchId)
    if (stream.hostId !== userId && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Solo el emisor puede parar la emisión')
    }

    await this.prisma.liveViewer.deleteMany({ where: { liveStreamId: stream.id } })

    return this.prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: false, endedAt: new Date(), hostId: null, hostPeerId: null },
    })
  }

  // ============================================
  // SCOREBOARD
  // ============================================

  private async assertHost(userId: string, matchId: string) {
    const stream = await this.prisma.liveStream.findUnique({ where: { matchId } })
    if (!stream) throw new NotFoundException('Stream no encontrado')
    if (stream.hostId !== userId) throw new ForbiddenException('Solo el emisor puede controlar el marcador')
    return stream
  }

  // ✅ FIX 3: permite configurar antes de emitir (solo requiere canManagePermissions)
async updateScoreboardConfig(
  userId: string, matchId: string,
  config: {
    scoreboardEnabled?: boolean
    clockEnabled?: boolean
    homeTeamName?: string
    awayTeamName?: string
    quarterDuration?: number
    overtimeDuration?: number
    customPeriodLabel?: string
  },
) {
  if (!(await this.canManagePermissions(userId, matchId))) {
    throw new ForbiddenException('No tienes permiso para configurar el marcador')
  }
  await this.getOrCreateStream(matchId)
  return this.prisma.liveStream.update({ where: { matchId }, data: config })
}

  async updateScore(userId: string, matchId: string, homeScore: number, awayScore: number) {
    await this.assertHost(userId, matchId)
    return this.prisma.liveStream.update({
      where: { matchId },
      data: {
        homeScore: Math.max(0, homeScore),
        awayScore: Math.max(0, awayScore),
      },
    })
  }

  async updateClock(
    userId: string, matchId: string,
    action: 'play' | 'pause' | 'reset' | 'set',
    seconds?: number,
  ) {
    const stream = await this.assertHost(userId, matchId)
    const now = new Date()

    if (action === 'play') {
      return this.prisma.liveStream.update({
        where: { matchId },
        data: { clockRunning: true, clockStartedAt: now },
      })
    }
    if (action === 'pause') {
      const elapsed = stream.clockStartedAt
        ? Math.floor((now.getTime() - stream.clockStartedAt.getTime()) / 1000)
        : 0
      let newSeconds: number
      if (stream.clockDirection === 'DOWN') {
        newSeconds = Math.max(0, stream.clockSeconds - elapsed)
      } else {
        newSeconds = stream.clockSeconds + elapsed
      }

      return this.prisma.liveStream.update({
        where: { matchId },
        data: { clockRunning: false, clockSeconds: newSeconds, clockStartedAt: null },
      })
    }
    if (action === 'reset') {
      return this.prisma.liveStream.update({
        where: { matchId },
        data: {
          clockRunning: false,
          clockSeconds: stream.clockDuration,
          clockStartedAt: null,
        },
      })
    }
    if (action === 'set' && typeof seconds === 'number') {
      return this.prisma.liveStream.update({
        where: { matchId },
        data: {
          clockSeconds: Math.max(0, seconds),
          clockStartedAt: stream.clockRunning ? now : null,
        },
      })
    }

    throw new BadRequestException('Acción no válida')
  }

async setCustomPeriod(userId: string, matchId: string, value: string) {
  await this.assertHost(userId, matchId)

  // ✅ Limpiar y validar: máximo 3 caracteres
  const clean = (value || '').trim().slice(0, 3)

  return this.prisma.liveStream.update({
    where: { matchId },
    data: { customPeriodLabel: clean || null },
  })
}

async nextPeriod(userId: string, matchId: string) {
  const stream = await this.assertHost(userId, matchId)
  const next = stream.currentPeriod + 1
  const isOT = next > 4

  // ✅ Generar label automático (Q1-Q4, OT1, OT2, OT3...)
  let label: string
  if (next <= 4) {
    label = `Q${next}`
  } else {
    label = `OT${next - 4}`
  }

  return this.prisma.liveStream.update({
    where: { matchId },
    data: {
      currentPeriod: next,
      isOvertime: isOT,
      customPeriodLabel: label,
      // ⚠️ NO tocamos el reloj (regla B confirmada)
    },
  })
}

  // ============================================
  // VIEWERS
  // ============================================

  async joinAsViewer(userId: string, matchId: string) {
    await this.verifyMatchAccess(userId, matchId)

    const stream = await this.prisma.liveStream.findUnique({
      where: { matchId },
      include: { viewers: true },
    })

    if (!stream || !stream.isLive) throw new BadRequestException('La emisión no está activa')

    const existing = stream.viewers.find((v) => v.userId === userId)
    if (existing) {
      return {
        viewerId: existing.id,
        hostPeerId: stream.hostPeerId,
        totalViewers: stream.viewers.length,
        maxUsers: stream.maxUsers,
      }
    }

    if (stream.viewers.length >= stream.maxUsers - 1) {
      throw new ForbiddenException(`Sala completa (máximo ${stream.maxUsers - 1} espectadores)`)
    }

    const viewer = await this.prisma.liveViewer.create({
      data: { liveStreamId: stream.id, userId, peerId: 'pending' },
    })

    return {
      viewerId: viewer.id,
      hostPeerId: stream.hostPeerId,
      totalViewers: stream.viewers.length + 1,
      maxUsers: stream.maxUsers,
    }
  }

  async registerViewerPeer(userId: string, matchId: string, peerId: string) {
    const stream = await this.prisma.liveStream.findUnique({ where: { matchId } })
    if (!stream) throw new NotFoundException('Stream no encontrado')

    const viewer = await this.prisma.liveViewer.findFirst({
      where: { liveStreamId: stream.id, userId },
    })
    if (!viewer) throw new NotFoundException('Viewer no registrado')

    return this.prisma.liveViewer.update({
      where: { id: viewer.id },
      data: { peerId },
    })
  }

  async leave(userId: string, matchId: string) {
    const stream = await this.prisma.liveStream.findUnique({ where: { matchId } })
    if (!stream) return { ok: true }
    await this.prisma.liveViewer.deleteMany({
      where: { liveStreamId: stream.id, userId },
    })
    return { ok: true }
  }

async setPeriodValue(userId: string, matchId: string, value: string) {
  await this.assertHost(userId, matchId)
  
  // Limpiar y validar: máximo 3 caracteres
  const clean = (value || '').trim().slice(0, 3).toUpperCase()
  
  // Detectar si es OT (empieza por OT)
  const isOT = clean.startsWith('OT')
  
  // Detectar número de periodo si es Q1-Q4
  let periodNum = 1
  if (/^Q[1-4]$/.test(clean)) {
    periodNum = parseInt(clean[1])
  } else if (/^[1-4]$/.test(clean)) {
    periodNum = parseInt(clean)
  } else if (isOT) {
    periodNum = 5 // marcamos como OT
  }

  return this.prisma.liveStream.update({
    where: { matchId },
    data: {
      currentPeriod: periodNum,
      isOvertime: isOT,
      // ✅ No tocamos el reloj
    },
  })
}

}