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

    // 1) ClubMember (cualquiera con acceso al club)
    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: match.team.clubId, isActive: true },
    })
    if (clubMember) return match

    // 2) TeamMembership activa (modelo nuevo)
    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId: match.teamId, status: 'ACTIVE' },
    })
    if (membership) return match

    // 3) TeamMember antiguo (compatibilidad)
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId: match.teamId, isActive: true },
    })
    if (teamMember) return match

    // 4) Tutor de un jugador del equipo (modelo NUEVO: TutorRelationship)
    const isTutorNew = await this.prisma.tutorRelationship.findFirst({
      where: {
        tutorUserId: userId,
        status: 'ACTIVE',
        playerUser: {
          memberships: {
            some: {
              teamId: match.teamId,
              status: 'ACTIVE',
            },
          },
        },
      },
    })
    if (isTutorNew) return match

    // 5) Tutor antiguo (compatibilidad con PlayerTutor)
    const isTutorLegacy = await this.prisma.playerTutor.findFirst({
      where: { userId, player: { teamId: match.teamId, isActive: true } },
    })
    if (isTutorLegacy) return match

    throw new ForbiddenException('No tienes acceso a este partido')
  }

  private async canManagePermissions(userId: string, matchId: string) {
    const { match, user } = await this.getMatchAndUser(userId, matchId)
    if (user.role === 'SUPER_ADMIN') return true

    // 1) ADMIN_CLUB del club
    const adminClub = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: match.team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })
    if (adminClub) return true

    // 2) TeamMembership con rol de gestión (modelo nuevo)
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId: match.teamId,
        status: 'ACTIVE',
        role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
      },
    })
    if (membership) return true

    // 3) COACH del equipo (modelo antiguo)
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

    // 1) ClubMembers
    const clubMembers = await this.prisma.clubMember.findMany({
      where: { clubId: match.team.clubId, isActive: true },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })

    // 2) TeamMembers (nuevo modelo)
    const teamMemberships = await this.prisma.teamMembership.findMany({
      where: { teamId: match.teamId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })

    // 3) TeamMembers (modelo antiguo)
    const legacyTeamMembers = await this.prisma.teamMember.findMany({
      where: { teamId: match.teamId, isActive: true },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })

    // 4) Tutores (modelo NUEVO: TutorRelationship)
    const tutorRelationships = await this.prisma.tutorRelationship.findMany({
      where: {
        status: 'ACTIVE',
        playerUser: {
          memberships: {
            some: {
              teamId: match.teamId,
              status: 'ACTIVE',
            },
          },
        },
      },
      include: {
        tutorUser: { select: { id: true, name: true, lastName: true, email: true, avatar: true } },
      },
    })

    // 5) Tutores legacy (PlayerTutor)
    const legacyTutors = await this.prisma.playerTutor.findMany({
      where: { player: { teamId: match.teamId, isActive: true }, userId: { not: null } },
      include: { user: { select: { id: true, name: true, lastName: true, email: true, avatar: true } } },
    })

    const map = new Map<string, any>()

    // Club members (rol más alto → no sobrescribir)
    for (const m of clubMembers) {
      map.set(m.user.id, {
        userId: m.user.id, name: m.user.name, lastName: m.user.lastName,
        email: m.user.email, avatar: m.user.avatar, role: `Club · ${m.role}`,
      })
    }

    // TeamMemberships nuevas
    for (const m of teamMemberships) {
      if (map.has(m.user.id)) {
        // Si ya está por club, solo sobrescribimos si NO es ADMIN_CLUB
        const existing = map.get(m.user.id)
        if (!existing.role.startsWith('Club · ADMIN')) {
          existing.role = `Equipo · ${m.role}`
        }
      } else {
        map.set(m.user.id, {
          userId: m.user.id, name: m.user.name, lastName: m.user.lastName,
          email: m.user.email, avatar: m.user.avatar, role: `Equipo · ${m.role}`,
        })
      }
    }

    // TeamMembers legacy
    for (const m of legacyTeamMembers) {
      if (map.has(m.user.id)) {
        const existing = map.get(m.user.id)
        if (!existing.role.startsWith('Club · ADMIN')) {
          existing.role = `Equipo · ${m.role}`
        }
      } else {
        map.set(m.user.id, {
          userId: m.user.id, name: m.user.name, lastName: m.user.lastName,
          email: m.user.email, avatar: m.user.avatar, role: `Equipo · ${m.role}`,
        })
      }
    }

    // Tutores nuevos
    for (const t of tutorRelationships) {
      if (!map.has(t.tutorUser.id)) {
        map.set(t.tutorUser.id, {
          userId: t.tutorUser.id, name: t.tutorUser.name, lastName: t.tutorUser.lastName,
          email: t.tutorUser.email, avatar: t.tutorUser.avatar, role: `Tutor · ${t.relationship}`,
        })
      }
    }

    // Tutores legacy
    for (const t of legacyTutors) {
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
  // INFO DEL STREAM
  // ============================================

  async getStreamInfo(userId: string, matchId: string) {
    await this.verifyMatchAccess(userId, matchId)

    const stream = await this.getOrCreateStream(matchId)

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

    const clean = (value || '').trim().slice(0, 3).toUpperCase()

    const isOT = clean.startsWith('OT')

    let periodNum = 1
    if (/^Q[1-4]$/.test(clean)) {
      periodNum = parseInt(clean[1])
    } else if (/^[1-4]$/.test(clean)) {
      periodNum = parseInt(clean)
    } else if (isOT) {
      periodNum = 5
    }

    return this.prisma.liveStream.update({
      where: { matchId },
      data: {
        currentPeriod: periodNum,
        isOvertime: isOT,
      },
    })
  }
}