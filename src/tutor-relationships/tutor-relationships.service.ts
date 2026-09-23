import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateTutorRelationshipDto,
  UpdateTutorRelationshipDto,
} from './dto'

@Injectable()
export class TutorRelationshipsService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Normaliza un username: siempre empieza por @.
   */
  private normalizeUsername(username: string): string {
    return username.startsWith('@') ? username : `@${username}`
  }

  /**
   * Verifica si un usuario es tutor existente de un jugador.
   * Se usa para permitir que un tutor apruebe la relación de otro tutor
   * (por ejemplo, la madre aprueba al padre).
   */
  private async isExistingTutor(
    userId: string,
    playerUserId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.tutorRelationship.findFirst({
      where: {
        tutorUserId: userId,
        playerUserId,
        status: 'ACTIVE',
      },
    })
    return !!existing
  }

  /**
   * Verifica si un usuario es coach/admin del equipo donde está el jugador.
   * Se usa para permitir que un entrenador apruebe relaciones
   * de jugadores fantasma (sin cuenta).
   */
  private async isCoachOfPlayerTeam(
    userId: string,
    playerUserId: string,
  ): Promise<boolean> {
    // Buscamos los equipos del jugador
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        userId: playerUserId,
        status: 'ACTIVE',
        role: 'PLAYER',
      },
      select: { teamId: true },
    })

    if (memberships.length === 0) return false

    const teamIds = memberships.map((m) => m.teamId)

    // Buscamos si el user es coach/assistant/admin de alguno de esos equipos
    const myMembership = await this.prisma.teamMembership.findFirst({
      where: {
        userId,
        teamId: { in: teamIds },
        status: 'ACTIVE',
        role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
      },
    })

    if (myMembership) return true

    // O si es admin del club
    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { clubId: true },
    })
    const clubIds = teams.map((t) => t.clubId)

    const clubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: { in: clubIds },
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    return !!clubAdmin
  }

  // ============================================
  // MIS TUTORES (si soy jugador)
  // ============================================

  async findMyTutors(userId: string) {
    return this.prisma.tutorRelationship.findMany({
      where: {
        playerUserId: userId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      include: {
        tutorUser: {
          select: {
            id: true,
            username: true,
            name: true,
            lastName: true,
            avatar: true,
            email: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
  }

  // ============================================
  // MIS JUGADORES (si soy tutor)
  // ============================================

  async findMyPlayers(userId: string) {
    return this.prisma.tutorRelationship.findMany({
      where: {
        tutorUserId: userId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      include: {
        playerUser: {
          select: {
            id: true,
            username: true,
            name: true,
            lastName: true,
            avatar: true,
            isGhost: true,
            memberships: {
              where: { status: 'ACTIVE', role: 'PLAYER' },
              include: {
                team: {
                  select: {
                    id: true,
                    name: true,
                    sport: true,
                    club: { select: { id: true, name: true, logo: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
  }

  // ============================================
  // CREAR SOLICITUD
  // ============================================

  async create(userId: string, dto: CreateTutorRelationshipDto) {
    const playerUsername = this.normalizeUsername(dto.playerUsername)

    // 1) Buscar al jugador por username
    const player = await this.prisma.user.findUnique({
      where: { username: playerUsername },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    if (player.id === userId) {
      throw new BadRequestException(
        'No puedes vincularte como tutor de ti mismo',
      )
    }

    // 2) Verificar que no existe ya una relación
    const existing = await this.prisma.tutorRelationship.findUnique({
      where: {
        tutorUserId_playerUserId: {
          tutorUserId: userId,
          playerUserId: player.id,
        },
      },
    })

    if (existing && existing.status !== 'REVOKED') {
      throw new ConflictException(
        'Ya existe una solicitud o vínculo con este jugador',
      )
    }

    // 3) Si existe y estaba REVOKED, la reactivamos
    if (existing && existing.status === 'REVOKED') {
      return this.prisma.tutorRelationship.update({
        where: { id: existing.id },
        data: {
          relationship: dto.relationship,
          canPickUp: dto.canPickUp ?? true,
          isEmergencyContact: dto.isEmergencyContact ?? false,
          status: 'PENDING',
          requestedById: userId,
          approvedById: null,
        },
      })
    }

    // 4) Crear la nueva relación
    return this.prisma.tutorRelationship.create({
      data: {
        tutorUserId: userId,
        playerUserId: player.id,
        relationship: dto.relationship || 'otro',
        canPickUp: dto.canPickUp ?? true,
        isEmergencyContact: dto.isEmergencyContact ?? false,
        status: 'PENDING',
        requestedById: userId,
      },
    })
  }

  // ============================================
  // APROBAR SOLICITUD
  // ============================================

  async approve(userId: string, relationshipId: string) {
    const rel = await this.prisma.tutorRelationship.findUnique({
      where: { id: relationshipId },
    })

    if (!rel) {
      throw new NotFoundException('Solicitud no encontrada')
    }

    if (rel.status !== 'PENDING') {
      throw new BadRequestException('La solicitud no está pendiente')
    }

    // ¿Quién puede aprobar?
    // A) El propio jugador
    // B) Otro tutor existente del jugador
    // C) Un coach/admin del equipo del jugador (solo si el jugador es fantasma)
    const player = await this.prisma.user.findUnique({
      where: { id: rel.playerUserId },
    })
    if (!player) throw new NotFoundException('Jugador no encontrado')

    let canApprove = false

    if (userId === rel.playerUserId) {
      canApprove = true
    } else if (await this.isExistingTutor(userId, rel.playerUserId)) {
      canApprove = true
    } else if (
      player.isGhost &&
      (await this.isCoachOfPlayerTeam(userId, rel.playerUserId))
    ) {
      canApprove = true
    }

    if (!canApprove) {
      throw new ForbiddenException('No tienes permisos para aprobar esta solicitud')
    }

    return this.prisma.tutorRelationship.update({
      where: { id: relationshipId },
      data: {
        status: 'ACTIVE',
        approvedById: userId,
      },
      include: {
        tutorUser: {
          select: { id: true, username: true, name: true, lastName: true },
        },
        playerUser: {
          select: { id: true, username: true, name: true, lastName: true },
        },
      },
    })
  }

  // ============================================
  // RECHAZAR SOLICITUD
  // ============================================

  async reject(userId: string, relationshipId: string) {
    const rel = await this.prisma.tutorRelationship.findUnique({
      where: { id: relationshipId },
    })

    if (!rel) throw new NotFoundException('Solicitud no encontrada')

    if (rel.status !== 'PENDING') {
      throw new BadRequestException('La solicitud no está pendiente')
    }

    // Mismos permisos que para aprobar
    const player = await this.prisma.user.findUnique({
      where: { id: rel.playerUserId },
    })
    if (!player) throw new NotFoundException('Jugador no encontrado')

    let canReject = false
    if (userId === rel.playerUserId) canReject = true
    else if (await this.isExistingTutor(userId, rel.playerUserId)) canReject = true
    else if (player.isGhost && (await this.isCoachOfPlayerTeam(userId, rel.playerUserId)))
      canReject = true

    if (!canReject) {
      throw new ForbiddenException('No tienes permisos para rechazar esta solicitud')
    }

    // La eliminamos (rechazo = no queremos guardar la solicitud)
    return this.prisma.tutorRelationship.delete({
      where: { id: relationshipId },
    })
  }

  // ============================================
  // REVOCAR VÍNCULO ACTIVO
  // ============================================

  async revoke(userId: string, relationshipId: string) {
    const rel = await this.prisma.tutorRelationship.findUnique({
      where: { id: relationshipId },
    })

    if (!rel) throw new NotFoundException('Relación no encontrada')

    // Puede revocar: el propio tutor o el propio jugador
    if (rel.tutorUserId !== userId && rel.playerUserId !== userId) {
      throw new ForbiddenException('No puedes revocar esta relación')
    }

    if (rel.status !== 'ACTIVE') {
      throw new BadRequestException('La relación no está activa')
    }

    return this.prisma.tutorRelationship.update({
      where: { id: relationshipId },
      data: { status: 'REVOKED' },
    })
  }

  // ============================================
  // ACTUALIZAR (relationship, canPickUp, isEmergencyContact)
  // ============================================

  async update(
    userId: string,
    relationshipId: string,
    dto: UpdateTutorRelationshipDto,
  ) {
    const rel = await this.prisma.tutorRelationship.findUnique({
      where: { id: relationshipId },
    })

    if (!rel) throw new NotFoundException('Relación no encontrada')

    // Solo el tutor de la relación puede actualizarla
    if (rel.tutorUserId !== userId) {
      throw new ForbiddenException('Solo el tutor puede actualizar la relación')
    }

    if (rel.status !== 'ACTIVE') {
      throw new BadRequestException('La relación no está activa')
    }

    return this.prisma.tutorRelationship.update({
      where: { id: relationshipId },
      data: {
        ...(dto.relationship !== undefined && { relationship: dto.relationship }),
        ...(dto.canPickUp !== undefined && { canPickUp: dto.canPickUp }),
        ...(dto.isEmergencyContact !== undefined && {
          isEmergencyContact: dto.isEmergencyContact,
        }),
      },
    })
  }
}