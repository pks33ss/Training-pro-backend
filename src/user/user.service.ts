import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'

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
        teams: {
          include: {
            team: {
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
        teams: {
          include: {
            team: {
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

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return this.prisma.user.delete({
      where: { id },
    })
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

    if (user.isGhost) {
      throw new NotFoundException('Usuario no encontrado')
    }

    return user
  }
}


