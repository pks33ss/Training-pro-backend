import { Injectable, NotFoundException, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'
import { CreateGhostDto } from './dto/create-ghost.dto'
import { generateUniqueUsername } from './utils/generate-username'
import { isSuperAdmin, canEditGhost, assertCanManageMembers } from '../common/access'

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
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
  // HARD DELETE (solo SUPER_ADMIN)
  // ============================================

  /**
   * Borra un user de la BD por completo (cascade).
   *
   * - Solo SUPER_ADMIN.
   * - Antes de borrar, notifica a los COACH activos de los equipos
   *   donde el user tiene memberships (excluyendo al propio user).
   * - Cascada: ClubMember, TeamMembership, MembershipRole, RefreshToken,
   *   Attendance, MatchPlayerStats, MatchCallup, FavoriteTeam,
   *   TutorRelationship, PendingInvitation, StreamPermission, LiveViewer...
   * - Las entidades creadas por él (Session, CalendarEvent, Match) quedan
   *   con `createdById = NULL` (no se borran).
   * - LiveStream.hostId → NULL.
   */
  async hardDelete(id: string, actorId: string) {
    // 1) Verificar actor
    if (!(await isSuperAdmin(this.prisma, actorId))) {
      throw new ForbiddenException('Solo los super administradores pueden eliminar usuarios')
    }

    // 2) Verificar que el user existe
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, lastName: true, email: true },
    })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    // 3) Notificar a coaches de los equipos donde tiene membership
    await this.notifyCoachesOfDeparture(id)

    // 4) Hard delete (cascade)
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

  /**
   * Notifica (console.log por ahora) a los COACH activos de los equipos
   * donde el user tiene memberships (activas o no), excluyendo al propio user.
   */
  private async notifyCoachesOfDeparture(userId: string): Promise<void> {
    // 1) Equipos donde el user tiene alguna membership
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
                NOT: { userId }, // excluye al propio user
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

    // 2) Deduplicar coaches por (coach.id, team.id)
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

  // ✅ NUEVO: Crear usuario desde el admin
  async create(data: { email: string; password: string; name: string; lastName: string; role?: string }) {
    // Verificar si el email ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email')
    }

    // Hashear la contraseña
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
    // Verificar si el email ya está en uso por otro usuario
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

    // Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta')
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Actualizar
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    // Revocar todos los refresh tokens (por seguridad)
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

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Actualizar contraseña
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    // Revocar todos los refresh tokens (el usuario deberá volver a iniciar sesión)
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    })

    return { message: 'Contraseña reseteada correctamente' }
  }

  // ============================================
  // NUEVOS MÉTODOS (Fase 3 - User refactor)
  // ============================================

  /**
   * Mi perfil completo: incluye memberships, tutores, jugadores a cargo.
   */
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

    // Calculamos la edad si tenemos birthDate (aunque no lo seleccionamos arriba, lo dejamos preparado)
    return user
  }

  /**
   * Actualizar mi perfil (campos editables: name, lastName, phone, bio, avatar).
   * NO permite cambiar email, username ni role desde aquí.
   */
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

  /**
   * Buscar usuarios limitado a los clubes del user que busca.
   * Excluye usuarios fantasma (isGhost: true) y el propio user.
   */
  async searchUsers(userId: string, query: string) {
    if (!query || query.trim().length < 2) {
      throw new NotFoundException(
        'La búsqueda debe tener al menos 2 caracteres',
      )
    }

    const q = query.trim().toLowerCase().replace(/^@/, '')

    // 1) Obtener los clubes del user
    const myClubs = await this.prisma.clubMember.findMany({
      where: { userId, isActive: true },
      select: { clubId: true },
    })

    const clubIds = myClubs.map((c) => c.clubId)

    if (clubIds.length === 0) {
      return []
    }

    // 2) Buscar usuarios en esos clubes
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          // ✅ Ya no filtramos por isGhost: queremos incluir también jugadores
          // migrados sin cuenta (fantasmas) porque son reutilizables.
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

  /**
   * Ficha pública de un usuario por username (sin @).
   * Devuelve solo información pública.
   */
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

  /**
   * Buscar un usuario registrado (no fantasma) por email o username exacto
   * para invitarlo a un equipo. Devuelve solo datos públicos.
   *
   * Restricción: solo SUPER_ADMIN, miembros activos de algún club,
   * o staff de algún equipo pueden usar este endpoint.
   */
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

    // Restricción de acceso: solo si el actor tiene algún rol de gestión
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

  /**
   * Crea un User "fantasma" (isGhost: true, sin password) y lo vincula a un equipo.
   * Útil cuando un coach quiere añadir a un jugador que todavía no se ha registrado.
   *
   * - Genera username autogenerado.
   * - Crea TeamMembership con status ACTIVE.
   * - Crea ClubMember con rol MEMBER (auto-vinculación al club).
   *
   * Cuando el jugador se registre con el mismo email, su cuenta se "reclamará"
   * (auth.service → register detecta isGhost y lo convierte en real).
   */
  async createGhost(requesterId: string, dto: CreateGhostDto) {
    // 1) Verificar equipo
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      include: { club: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

// 2) Verificar permisos del requester
await assertCanManageMembers(this.prisma, requesterId, dto.teamId)

    // 3) Verificar email si lo dan
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
    // 3a) Fantasma existente → añadirlo al equipo (no crear nuevo)
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
    // 3b) Usuario real → redirigir a "Usuario Registrado" (Tarea 2)
    throw new ConflictException({
      code: 'USER_ALREADY_EXISTS_USE_EMAIL_INVITE',
      message:
        'Ya existe un usuario registrado con ese email. Usa "Usuario Registrado" para invitarlo.',
    })
  }
}

    // 4) Generar username único
    const username = await generateUniqueUsername(
      this.prisma,
      dto.name,
      dto.lastName,
    )

    // 5) Crear User + TeamMembership + ClubMember en una transacción
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

    // 6) Devolver con la forma que espera el frontend
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

  /**
   * Editar los datos personales de un user "fantasma" (isGhost: true).
   * Solo SUPER_ADMIN, ADMIN_CLUB del club o COACH/ASSISTANT/ADMIN_TEAM del equipo.
   */
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
    // 1) Verificar permisos
    if (!(await canEditGhost(this.prisma, actorId, targetUserId))) {
      throw new ForbiddenException(
        'No tienes permisos para editar este usuario (o no es un jugador sin cuenta)',
      )
    }

    // 2) Verificar que el target es ghost (por defensa en profundidad)
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

    // 3) Validar email si viene
    if (data.email !== undefined && data.email !== null && data.email !== '') {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, NOT: { id: targetUserId } },
        select: { id: true },
      })
      if (existing) {
        throw new ConflictException('Ya existe otro usuario con ese email')
      }
    }

    // 4) Actualizar
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