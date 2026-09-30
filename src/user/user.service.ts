import { Injectable, NotFoundException, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'
import { CreateGhostDto } from './dto/create-ghost.dto'
import { generateUniqueUsername } from './utils/generate-username'
import { isSuperAdmin, canEditGhost, assertCanManageMembers } from '../common/access'

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

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

  /**
   * Marca un user como eliminado (soft delete).
   *
   * - Solo SUPER_ADMIN.
   * - User.deletedAt = now() → no puede login ni refresh.
   * - Todas las TeamMembership activas → LEFT.
   * - RefreshTokens revocados.
   * - ClubMember desactivado.
   * - Aviso a coaches de los equipos.
   */
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

    // Avisar a coaches antes de desvincular
    await this.notifyCoachesOfDeparture(id)

    await this.prisma.$transaction(async (tx) => {
      // 1) Soft delete
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      // 2) Memberships activas → LEFT
      await tx.teamMembership.updateMany({
        where: { userId: id, status: 'ACTIVE' },
        data: { status: 'LEFT', leftAt: new Date() },
      })

      // 3) ClubMembers → inactivos
      await tx.clubMember.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false },
      })

      // 4) RefreshTokens revocados
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

  /**
   * Permite a un usuario eliminar su propia cuenta (soft delete).
   * No hay hard delete self-service.
   * Avisa a los coaches de los equipos donde estaba.
   */
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

    // Avisar a coaches antes de desvincular
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
        return ghost
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

    return {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      lastName: newUser.lastName,
      email: newUser.email,
      isGhost: newUser.isGhost,
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
}