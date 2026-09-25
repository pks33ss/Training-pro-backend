
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  private async verifyTeamAccess(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (user?.role === 'SUPER_ADMIN') return team

    // 1) Admin del club (acceso global al club)
    const clubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })
    if (clubAdmin) return team

    // 2) TeamMembership activa (modelo nuevo)
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId,
        status: 'ACTIVE',
      },
    })
    if (membership) return team

    // 3) TeamMember antiguo (compatibilidad con datos pre-migración)
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId, isActive: true },
    })
    if (teamMember) return team

    throw new ForbiddenException('No tienes acceso a este equipo')
  }

  // ============================================
  // OBTENER EVENTOS DE UN RANGO DE FECHAS
  // ============================================

  async getEvents(userId: string, teamId: string, from: Date, to: Date) {
    await this.verifyTeamAccess(userId, teamId)

    // Ejecutamos en paralelo
    const [sessions, matches, calendarEvents] = await Promise.all([
      // Sesiones
      this.prisma.session.findMany({
        where: {
          teamId,
          date: { gte: from, lte: to },
        },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          location: true,
        },
      }),

      // Partidos
      this.prisma.match.findMany({
        where: {
          teamId,
          date: { gte: from, lte: to },
        },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          opponent: true,
          date: true,
          location: true,
          venue: true,
          type: true,
          status: true,
          teamScore: true,
          opponentScore: true,
        },
      }),

      // Eventos de calendario
      this.prisma.calendarEvent.findMany({
        where: {
          teamId,
          startDate: { gte: from, lte: to },
        },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          startDate: true,
          endDate: true,
          type: true,
          location: true,
        },
      }),
    ])

    // Normalizamos todo a un formato común
    const events: any[] = []

    for (const s of sessions) {
      events.push({
        id: s.id,
        type: 'SESSION',
        title: s.title,
        description: null,
        startDate: s.date,
        endDate: new Date(new Date(s.date).getTime() + s.duration * 60000),
        location: s.location,
        duration: s.duration,
        link: `/sessions/${s.id}`,
      })
    }

    for (const m of matches) {
      events.push({
        id: m.id,
        type: 'MATCH',
        title: `vs ${m.opponent}`,
        description: m.type,
        startDate: m.date,
        endDate: null,
        location: m.venue,
        status: m.status,
        teamScore: m.teamScore,
        opponentScore: m.opponentScore,
        link: `/matches/${m.id}`,
      })
    }

    for (const c of calendarEvents) {
      events.push({
        id: c.id,
        type: 'EVENT',
        title: c.title,
        description: c.description,
        startDate: c.startDate,
        endDate: c.endDate,
        location: c.location,
        eventType: c.type,
        link: null,
      })
    }

    // Ordenamos por fecha
    events.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )

    return events
  }

  // ============================================
  // OBTENER EVENTOS DE VARIOS EQUIPOS
  // ============================================

  async getEventsByTeams(userId: string, teamIds: string[], from: Date, to: Date) {
    if (!teamIds || teamIds.length === 0) return []

    // Verificar acceso a todos los equipos
    await Promise.all(teamIds.map((id) => this.verifyTeamAccess(userId, id)))

    // Cargar eventos de todos los equipos en paralelo
    const [sessions, matches, calendarEvents] = await Promise.all([
      this.prisma.session.findMany({
        where: { teamId: { in: teamIds }, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          location: true,
          teamId: true,
          team: { select: { name: true } },
        },
      }),

      this.prisma.match.findMany({
        where: { teamId: { in: teamIds }, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          opponent: true,
          date: true,
          location: true,
          venue: true,
          type: true,
          status: true,
          teamScore: true,
          opponentScore: true,
          teamId: true,
          team: { select: { name: true } },
        },
      }),

      this.prisma.calendarEvent.findMany({
        where: { teamId: { in: teamIds }, startDate: { gte: from, lte: to } },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          startDate: true,
          endDate: true,
          type: true,
          location: true,
          teamId: true,
          team: { select: { name: true } },
        },
      }),
    ])

    // Normalizamos todo a un formato común (con teamId y teamName)
    const events: any[] = []

    for (const s of sessions) {
      events.push({
        id: s.id,
        type: 'SESSION',
        title: s.title,
        description: null,
        startDate: s.date,
        endDate: new Date(new Date(s.date).getTime() + s.duration * 60000),
        location: s.location,
        duration: s.duration,
        link: `/sessions/${s.id}`,
        teamId: s.teamId,
        teamName: s.team?.name,
      })
    }

    for (const m of matches) {
      events.push({
        id: m.id,
        type: 'MATCH',
        title: `vs ${m.opponent}`,
        description: m.type,
        startDate: m.date,
        endDate: null,
        location: m.venue,
        status: m.status,
        teamScore: m.teamScore,
        opponentScore: m.opponentScore,
        link: `/matches/${m.id}`,
        teamId: m.teamId,
        teamName: m.team?.name,
      })
    }

    for (const c of calendarEvents) {
      events.push({
        id: c.id,
        type: 'EVENT',
        title: c.title,
        description: c.description,
        startDate: c.startDate,
        endDate: c.endDate,
        location: c.location,
        eventType: c.type,
        link: null,
        teamId: c.teamId,
        teamName: c.team?.name,
      })
    }

    events.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )

    return events
  }

  // ============================================
  // CREAR EVENTO DE CALENDARIO
  // ============================================

  async createEvent(userId: string, teamId: string, data: {
    title: string
    description?: string
    startDate: string
    endDate: string
    type?: string
    location?: string
  }) {
    const team = await this.verifyTeamAccess(userId, teamId)

    return this.prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        type: (data.type as any) || 'OTHER',
        location: data.location,
        clubId: team.clubId,
        teamId: teamId,
        createdById: userId,
      },
    })
  }

  // ============================================
  // ACTUALIZAR EVENTO
  // ============================================

  async updateEvent(userId: string, eventId: string, data: {
    title?: string
    description?: string
    startDate?: string
    endDate?: string
    type?: string
    location?: string
  }) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
    })
    if (!event) throw new NotFoundException('Evento no encontrado')

    if (event.teamId) {
      await this.verifyTeamAccess(userId, event.teamId)
    } else {
      // Evento del club sin equipo específico → verificar acceso al club
      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (user?.role !== 'SUPER_ADMIN') {
        const member = await this.prisma.clubMember.findFirst({
          where: { userId, clubId: event.clubId, isActive: true },
        })
        if (!member) throw new ForbiddenException('No tienes acceso a este evento')
      }
    }

    const updateData: any = { ...data }
    if (data.startDate) updateData.startDate = new Date(data.startDate)
    if (data.endDate) updateData.endDate = new Date(data.endDate)

    return this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
    })
  }

  // ============================================
  // ELIMINAR EVENTO
  // ============================================

  async removeEvent(userId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
    })
    if (!event) throw new NotFoundException('Evento no encontrado')

    if (event.teamId) {
      await this.verifyTeamAccess(userId, event.teamId)
    } else {
      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (user?.role !== 'SUPER_ADMIN') {
        const member = await this.prisma.clubMember.findFirst({
          where: { userId, clubId: event.clubId, isActive: true },
        })
        if (!member) throw new ForbiddenException('No tienes acceso a este evento')
      }
    }

    return this.prisma.calendarEvent.delete({ where: { id: eventId } })
  }
}