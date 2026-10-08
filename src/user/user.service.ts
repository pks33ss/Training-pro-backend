import { Injectable, NotFoundException, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'
import { CreateGhostDto } from './dto/create-ghost.dto'
import { generateUniqueUsername } from './utils/generate-username'
import {
  isSuperAdmin,
  canEditGhost,
  assertCanManageMembers,
  assertCanViewPlayerProfile,
  assertCanEditPlayerProfile,
  canViewPlayerProfile,
  canEditPlayerProfile,
} from '../common/access'
import { UpdatePlayerProfileDto } from './dto/update-player-profile.dto'
import { CreateInjuryDto } from './dto/create-injury.dto'
import { UpdateInjuryDto } from './dto/update-injury.dto'
import { MailService } from '../mail/mail.service'
import { MailModule } from '../mail/mail.module'
import { generateInvitationCode } from '../invitations/utils/generate-code'

@Injectable()
export class UserService {
  constructor(
  private prisma: PrismaService,
  private mailService: MailService,
) {}

  async findAll(includeDeleted = false) {
    return this.prisma.user.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        role: true,
        createdAt: true,
        clubs: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        role: true,
        createdAt: true,
        clubs: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return user
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
      },
    })

    return user
  }

  async updateRole(id: string, role: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        role: role as any,
      },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        role: true,
      },
    })
  }

  // ============================================
  // SOFT DELETE (solo SUPER_ADMIN)
  // ============================================

  async softDelete(id: string, actorId: string) {
    if (!(await isSuperAdmin(this.prisma, actorId))) {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, lastName: true, email: true, deletedAt: true },
    })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }
    if (user.deletedAt) {
      throw new ConflictException('El usuario ya estaba eliminado')
    }

    await this.notifyCoachesOfDeparture(id)

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      await tx.teamMembership.updateMany({
        where: { userId: id, status: 'ACTIVE' },
        data: { status: 'LEFT', leftAt: new Date() },
      })

      await tx.clubMember.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false },
      })

      await tx.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      })
    })

    return {
      deleted: true,
      mode: 'soft',
      userId: id,
    }
  }

  // ============================================
  // DELETE ME (borrar mi propia cuenta)
  // ============================================

  async deleteMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, lastName: true, email: true, deletedAt: true },
    })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }
    if (user.deletedAt) {
      throw new ConflictException('Tu cuenta ya estaba eliminada')
    }

    await this.notifyCoachesOfDeparture(userId)

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      })

      await tx.teamMembership.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'LEFT', leftAt: new Date() },
      })

      await tx.clubMember.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      })

      await tx.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      })
    })

    return {
      deleted: true,
      mode: 'soft',
      userId,
    }
  }

  // ============================================
  // HARD DELETE (solo SUPER_ADMIN)
  // ============================================

  async hardDelete(id: string, actorId: string) {
    if (!(await isSuperAdmin(this.prisma, actorId))) {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, lastName: true, email: true },
    })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    await this.notifyCoachesOfDeparture(id)

    await this.prisma.user.delete({
      where: { id },
    })

    return {
      deleted: true,
      mode: 'hard',
      userId: id,
    }
  }

  // ============================================
  // NOTIFICAR A COACHES
  // ============================================

  private async notifyCoachesOfDeparture(userId: string): Promise<void> {
    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId },
      select: {
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: {
                status: 'ACTIVE',
                roles: { some: { role: 'COACH' } },
                NOT: { userId },
              },
              select: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const seen = new Set<string>()
    const notifiedAt = new Date()

    for (const m of memberships) {
      for (const coachMembership of m.team.memberships) {
        const coach = coachMembership.user
        const key = `${coach.id}::${m.team.id}`
        if (seen.has(key)) continue
        seen.add(key)

        console.log(
          `📧 [PENDIENTE SMTP] Aviso a ${coach.email ?? coach.id}: ` +
            `el usuario ${userId} ha sido eliminado y ya no forma parte del equipo "${m.team.name}". ` +
            `Fecha: ${notifiedAt.toLocaleDateString('es-ES')}`,
        )
      }
    }
  }

  // ============================================
  // CREAR USUARIO DESDE ADMIN
  // ============================================

  async create(data: { email: string; password: string; name: string; lastName: string; role?: string }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email')
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    return this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        lastName: data.lastName,
        role: (data.role as any) || 'USER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    })
  }

  // ============================================
  // PERFIL DEL USUARIO
  // ============================================

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        phone: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return user
  }

  async updateProfile(userId: string, data: any) {
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: userId },
        },
      })

      if (existingUser) {
        throw new ConflictException('Ya existe otro usuario con este email')
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        bio: data.bio,
        avatar: data.avatar,
      },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        phone: true,
        avatar: true,
        bio: true,
        role: true,
      },
    })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta')
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    })

    return { message: 'Contraseña actualizada correctamente' }
  }

  // ============================================
  // RESETEO DE CONTRASEÑA
  // ============================================

  async resetPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    })

    return { message: 'Contraseña reseteada correctamente' }
  }

  // ============================================
  // PERFIL PROPIO (getMe / updateMe)
  // ============================================

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        lastName: true,
        phone: true,
        avatar: true,
        bio: true,
        role: true,
        isGhost: true,
        createdAt: true,
        // ✅ NUEVO — flags de notificaciones por email
        emailNotificationsEnabled: true,
        emailOptOut: true,
        memberships: {
          include: {
            team: {
              include: {
                club: {
                  select: { id: true, name: true, logo: true },
                },
              },
            },
            season: {
              select: { id: true, name: true, color: true },
            },
          },
          orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
        },
        tutorRelationships: {
          where: { status: { in: ['ACTIVE', 'PENDING'] } },
          include: {
            playerUser: {
              select: {
                id: true,
                name: true,
                lastName: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        playerRelationships: {
          where: { status: { in: ['ACTIVE', 'PENDING'] } },
          include: {
            tutorUser: {
              select: {
                id: true,
                name: true,
                lastName: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    })

    if (!user) throw new NotFoundException('Usuario no encontrado')

    return user
  }

  async updateMe(
    userId: string,
    data: {
      name?: string
      lastName?: string
      phone?: string
      bio?: string
      avatar?: string
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Usuario no encontrado')

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        lastName: true,
        phone: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    })
  }

  // ============================================
  // PREFERENCIAS DE EMAIL (opt-out del propio usuario)
  // ============================================

  /**
   * Actualiza el flag `emailOptOut` del usuario logueado.
   * - `emailOptOut = true`  → el usuario NO recibe emails, aunque el admin le tenga ON.
   * - `emailOptOut = false` → recibe según `emailNotificationsEnabled` (norma del admin).
   */
  async updateEmailOptOut(userId: string, optOut: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { emailOptOut: optOut },
      select: {
        id: true,
        emailOptOut: true,
        emailNotificationsEnabled: true,
      },
    })
  }

  // ============================================
  // BÚSQUEDA DE USUARIOS
  // ============================================

  async searchUsers(userId: string, query: string) {
    if (!query || query.trim().length < 2) {
      throw new NotFoundException(
        'La búsqueda debe tener al menos 2 caracteres',
      )
    }

    const q = query.trim().toLowerCase().replace(/^@/, '')

    const myClubs = await this.prisma.clubMember.findMany({
      where: { userId, isActive: true },
      select: { clubId: true },
    })

    const clubIds = myClubs.map((c) => c.clubId)

    if (clubIds.length === 0) {
      return []
    }

    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          { deletedAt: null },
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              {
                memberships: {
                  some: {
                    team: { clubId: { in: clubIds } },
                    status: 'ACTIVE',
                  },
                },
              },
              {
                clubs: {
                  some: {
                    clubId: { in: clubIds },
                    isActive: true,
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        name: true,
        lastName: true,
        avatar: true,
        bio: true,
        role: true,
        isGhost: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                sport: true,
                club: { select: { id: true, name: true } },
              },
            },
          },
          take: 3,
        },
      },
      take: 20,
      orderBy: [{ name: 'asc' }, { lastName: 'asc' }],
    })

    return users
  }

  async findByUsername(username: string) {
    const cleanUsername = username.startsWith('@') ? username : `@${username}`

    const user = await this.prisma.user.findUnique({
      where: { username: cleanUsername },
      select: {
        id: true,
        username: true,
        name: true,
        lastName: true,
        avatar: true,
        bio: true,
        role: true,
        isGhost: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                sport: true,
                category: true,
                club: { select: { id: true, name: true, logo: true } },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return user
  }

  async lookupUserForInvite(
    actorId: string,
    query: { email?: string; username?: string },
  ) {
    if (!query.email && !query.username) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado',
      })
    }

    const cleanUsername = query.username
      ? query.username.startsWith('@')
        ? query.username
        : `@${query.username}`
      : undefined

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(query.email ? [{ email: query.email }] : []),
          ...(cleanUsername ? [{ username: cleanUsername }] : []),
        ],
        isGhost: false,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        username: true,
      },
    })

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado',
      })
    }

    const isSuper = await isSuperAdmin(this.prisma, actorId)
    if (!isSuper) {
      const isClubMember = await this.prisma.clubMember.findFirst({
        where: { userId: actorId, isActive: true },
        select: { id: true },
      })
      const isTeamStaff = await this.prisma.teamMembership.findFirst({
        where: {
          userId: actorId,
          status: 'ACTIVE',
          roles: {
            some: {
              role: { in: ['COACH', 'ASSISTANT', 'ADMIN_TEAM'] },
            },
          },
        },
        select: { id: true },
      })
      if (!isClubMember && !isTeamStaff) {
        throw new ForbiddenException(
          'No tienes permisos para buscar usuarios',
        )
      }
    }

    return user
  }

  // ============================================
  // CREAR USUARIO FANTASMA Y AÑADIRLO A UN EQUIPO
  // ============================================

      async createGhost(requesterId: string, dto: CreateGhostDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      include: { club: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    await assertCanManageMembers(this.prisma, requesterId, dto.teamId)

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true, isGhost: true, deletedAt: true },
      })

      if (existing?.deletedAt) {
        throw new ConflictException({
          code: 'USER_DELETED',
          message: 'Ese email pertenece a una cuenta eliminada.',
        })
      }

      if (existing?.isGhost) {
        await this.addExistingGhostToTeam(existing.id, dto, requesterId)

        const ghost = await this.prisma.user.findUnique({
          where: { id: existing.id },
          select: {
            id: true,
            username: true,
            name: true,
            lastName: true,
            email: true,
            isGhost: true,
          },
        })

        let invitationSent = false
        if (dto.sendInvitation && ghost?.email) {
          invitationSent = await this.sendGhostInvitation(
            ghost.id,
            ghost.email,
            ghost.name,
            ghost.lastName,
            dto.teamId,
            requesterId,
          )
        }

        return { ...ghost, invitationSent }
      }

      if (existing && !existing.isGhost) {
        throw new ConflictException({
          code: 'USER_ALREADY_EXISTS_USE_EMAIL_INVITE',
          message:
            'Ya existe un usuario registrado con ese email. Usa "Usuario Registrado" para invitarlo.',
        })
      }
    }

    const username = await generateUniqueUsername(
      this.prisma,
      dto.name,
      dto.lastName,
    )

    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          lastName: dto.lastName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          password: null,
          username,
          isGhost: true,
          role: 'USER',
        },
      })

      await tx.teamMembership.create({
        data: {
          userId: user.id,
          teamId: dto.teamId,
          roles: { create: [{ role: (dto.role ?? 'PLAYER') as any }] },
          status: 'ACTIVE',
          jerseyNumber: dto.jerseyNumber ?? null,
          position: dto.position ?? null,
          invitedById: requesterId,
        },
      })

      await tx.clubMember.create({
        data: {
          userId: user.id,
          clubId: team.clubId,
          role: 'MEMBER',
          isActive: true,
        },
      })

      return user
    })

    let invitationSent = false
    if (dto.sendInvitation && newUser.email) {
      invitationSent = await this.sendGhostInvitation(
        newUser.id,
        newUser.email,
        newUser.name,
        newUser.lastName,
        dto.teamId,
        requesterId,
      )
    }

    return {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      lastName: newUser.lastName,
      email: newUser.email,
      isGhost: newUser.isGhost,
      invitationSent,
    }
  }

  // ============================================
  // EDITAR PERFIL DE UN GHOST
  // ============================================

  async updateGhostProfile(
    actorId: string,
    targetUserId: string,
    data: {
      name?: string
      lastName?: string
      phone?: string | null
      email?: string | null
      bio?: string | null
    },
  ) {
    if (!(await canEditGhost(this.prisma, actorId, targetUserId))) {
      throw new ForbiddenException(
        'No tienes permisos para editar este usuario (o no es un jugador sin cuenta)',
      )
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isGhost: true },
    })
    if (!target) {
      throw new NotFoundException('Usuario no encontrado')
    }
    if (!target.isGhost) {
      throw new ForbiddenException(
        'Este usuario ya tiene cuenta. Solo se pueden editar los datos de jugadores sin cuenta.',
      )
    }

    if (data.email !== undefined && data.email !== null && data.email !== '') {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, NOT: { id: targetUserId } },
        select: { id: true },
      })
      if (existing) {
        throw new ConflictException('Ya existe otro usuario con ese email')
      }
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.bio !== undefined && { bio: data.bio || null }),
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        phone: true,
        email: true,
        bio: true,
        isGhost: true,
        username: true,
      },
    })
  }

  private async addExistingGhostToTeam(
    ghostId: string,
    dto: CreateGhostDto,
    requesterId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { clubId: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    await this.prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: ghostId, teamId: dto.teamId } },
      create: {
        userId: ghostId,
        teamId: dto.teamId,
        status: 'ACTIVE',
        invitedById: requesterId,
        jerseyNumber: dto.jerseyNumber ?? null,
        position: dto.position ?? null,
        roles: { create: [{ role: (dto.role ?? 'PLAYER') as any }] },
      },
      update: {
        status: 'ACTIVE',
        leftAt: null,
        ...(dto.jerseyNumber !== undefined && { jerseyNumber: dto.jerseyNumber }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    })

    await this.prisma.clubMember.upsert({
      where: { userId_clubId: { userId: ghostId, clubId: team.clubId } },
      create: {
        userId: ghostId,
        clubId: team.clubId,
        role: 'MEMBER',
        isActive: true,
      },
      update: { isActive: true },
    })
  }

    /**
   * Crea una invitación pendiente para un fantasma y envía el email.
   * Devuelve true si el email se envió correctamente.
   */
  private async sendGhostInvitation(
    ghostUserId: string,
    email: string,
    name: string,
    lastName: string,
    teamId: string,
    requesterId: string,
  ): Promise<boolean> {
    try {
      // Marcar invitaciones previas como revocadas
      await this.prisma.pendingInvitation.updateMany({
        where: { userId: ghostUserId, teamId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      })

      // Generar código
      const { generateInvitationCode } = await import(
        '../invitations/utils/generate-code'
      )
      const code = generateInvitationCode()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const invitation = await this.prisma.pendingInvitation.create({
        data: {
          code,
          email,
          userId: ghostUserId,
          teamId,
          role: 'PLAYER',
          channel: 'EMAIL',
          expiresAt,
          invitedById: requesterId,
        },
        include: {
          team: { include: { club: true } },
          invitedBy: {
            select: { id: true, name: true, lastName: true, username: true },
          },
        },
      })

      // Enviar email
      const baseUrl =
        process.env.FRONTEND_URL || 'https://joinsportapp.com'
      const invitationLink = `${baseUrl}/register?invitation=${code}`

      const result = await this.mailService.sendInvitationEmail(email, {
        recipientName: `${name} ${lastName}`.trim() || 'amigo/a',
        teamName: invitation.team.name,
        clubName: invitation.team.club?.name ?? '',
        role: invitation.role,
        inviterName: `${invitation.invitedBy.name} ${invitation.invitedBy.lastName}`,
        invitationLink,
        expiresAt: invitation.expiresAt,
      })

      return result.sent
    } catch (err: any) {
      console.error('Error enviando invitación a ghost:', err)
      return false
    }
  }

  // ============================================
  // PERMISOS DE VISUALIZACIÓN DEL PERFIL
  // ============================================

  async getUserPermissions(viewerId: string, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, deletedAt: true },
    })

    if (!target || target.deletedAt) {
      return {
        canViewProfile: false,
        canEditProfile: false,
      }
    }

    const [canViewProfile, canEditProfile] = await Promise.all([
      canViewPlayerProfile(this.prisma, viewerId, targetUserId),
      canEditPlayerProfile(this.prisma, viewerId, targetUserId),
    ])

    return {
      canViewProfile,
      canEditProfile,
    }
  }

  // ============================================
  // PLAYER PROFILE (Fase 4)
  // ============================================

  async getPlayerProfile(viewerId: string, targetUserId: string) {
    await assertCanViewPlayerProfile(this.prisma, viewerId, targetUserId)

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId: targetUserId },
    })

    return profile ?? null
  }

  async updatePlayerProfile(
    viewerId: string,
    targetUserId: string,
    data: UpdatePlayerProfileDto,
  ) {
    await assertCanEditPlayerProfile(this.prisma, viewerId, targetUserId)

    const str = (
      v: string | null | undefined,
    ): string | null | undefined => {
      if (v === undefined) return undefined
      if (v === null) return null
      const t = String(v).trim()
      return t.length === 0 ? null : t
    }

    const num = (
      v: number | string | null | undefined,
    ): number | null | undefined => {
      if (v === undefined) return undefined
      if (v === null) return null
      if (typeof v === 'string') {
        const t = v.trim()
        if (t.length === 0) return null
        const n = Number(t)
        return Number.isNaN(n) ? null : n
      }
      return v
    }

    const date = (
      v: string | null | undefined,
    ): Date | null | undefined => {
      if (v === undefined) return undefined
      if (v === null) return null
      const t = String(v).trim()
      if (t.length === 0) return null
      const d = new Date(t)
      return isNaN(d.getTime()) ? null : d
    }

    const normalized = {
      birthDate: date(data.birthDate),
      dni: str(data.dni),
      fatherName: str(data.fatherName),
      motherName: str(data.motherName),
      fatherPhone: str(data.fatherPhone),
      motherPhone: str(data.motherPhone),
      address: str(data.address),
      schoolOrCompany: str(data.schoolOrCompany),
      allergies: str(data.allergies),
      height: num(data.height),
      wingspan: num(data.wingspan),
      weight: num(data.weight),
      emergencyContactName: str(data.emergencyContactName),
      emergencyContactPhone: str(data.emergencyContactPhone),
      medicalInsurance: str(data.medicalInsurance),
      medicalInsuranceNumber: str(data.medicalInsuranceNumber),
      shirtSize: str(data.shirtSize),
      pantsSize: str(data.pantsSize),
      shoeSize: str(data.shoeSize),
    }

    const updateData = Object.fromEntries(
      Object.entries(normalized).filter(([, v]) => v !== undefined),
    )

    const profile = await this.prisma.playerProfile.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        ...updateData,
      },
      update: updateData,
    })

    return profile
  }

  // ============================================
  // INJURIES (Fase 4)
  // ============================================

  async listInjuries(viewerId: string, targetUserId: string) {
    await assertCanViewPlayerProfile(this.prisma, viewerId, targetUserId)

    return this.prisma.injury.findMany({
      where: { userId: targetUserId },
      orderBy: { date: 'desc' },
    })
  }

  async createInjury(
    viewerId: string,
    targetUserId: string,
    data: CreateInjuryDto,
  ) {
    await assertCanEditPlayerProfile(this.prisma, viewerId, targetUserId)

    return this.prisma.injury.create({
      data: {
        userId: targetUserId,
        date: new Date(data.date),
        description: data.description,
        bodyPart: data.bodyPart ? data.bodyPart.trim() || null : null,
        severity: data.severity ? data.severity.trim() || null : null,
        status: data.status ?? 'ACTIVE',
        expectedReturn: data.expectedReturn
          ? new Date(data.expectedReturn)
          : null,
        actualReturn: data.actualReturn ? new Date(data.actualReturn) : null,
        treatment: data.treatment ? data.treatment.trim() || null : null,
        doctor: data.doctor ? data.doctor.trim() || null : null,
        notes: data.notes ? data.notes.trim() || null : null,
      },
    })
  }

  async updateInjury(
    viewerId: string,
    targetUserId: string,
    injuryId: string,
    data: UpdateInjuryDto,
  ) {
    await assertCanEditPlayerProfile(this.prisma, viewerId, targetUserId)

    const existing = await this.prisma.injury.findFirst({
      where: { id: injuryId, userId: targetUserId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException('Lesión no encontrada')
    }

    const updateData: any = {}
    if (data.date !== undefined) updateData.date = new Date(data.date)
    if (data.description !== undefined)
      updateData.description = data.description
    if (data.bodyPart !== undefined)
      updateData.bodyPart = data.bodyPart ? data.bodyPart.trim() || null : null
    if (data.severity !== undefined)
      updateData.severity = data.severity ? data.severity.trim() || null : null
    if (data.status !== undefined) updateData.status = data.status
    if (data.expectedReturn !== undefined)
      updateData.expectedReturn = data.expectedReturn
        ? new Date(data.expectedReturn)
        : null
    if (data.actualReturn !== undefined)
      updateData.actualReturn = data.actualReturn
        ? new Date(data.actualReturn)
        : null
    if (data.treatment !== undefined)
      updateData.treatment = data.treatment
        ? data.treatment.trim() || null
        : null
    if (data.doctor !== undefined)
      updateData.doctor = data.doctor ? data.doctor.trim() || null : null
    if (data.notes !== undefined)
      updateData.notes = data.notes ? data.notes.trim() || null : null

    return this.prisma.injury.update({
      where: { id: injuryId },
      data: updateData,
    })
  }

  async deleteInjury(
    viewerId: string,
    targetUserId: string,
    injuryId: string,
  ) {
    await assertCanEditPlayerProfile(this.prisma, viewerId, targetUserId)

    const existing = await this.prisma.injury.findFirst({
      where: { id: injuryId, userId: targetUserId },
      select: { id: true },
    })
    if (!existing) {
      throw new NotFoundException('Lesión no encontrada')
    }

    await this.prisma.injury.delete({ where: { id: injuryId } })

    return { deleted: true, id: injuryId }
  }
}