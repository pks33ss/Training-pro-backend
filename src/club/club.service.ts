import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class ClubService {
  constructor(private prisma: PrismaService,
            private cloudinaryService: CloudinaryService,
            ) {}

  async create(userId: string, createClubDto: CreateClubDto) {
    const club = await this.prisma.club.create({
      data: {
        name: createClubDto.name,
        description: createClubDto.description,
        address: createClubDto.address,
        phone: createClubDto.phone,
        email: createClubDto.email,
        members: {
          create: {
            userId: userId,
            role: 'ADMIN_CLUB',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return club;
  }

  async findAll(userId: string) {
  const currentUser = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  // Si es SUPER_ADMIN, ver todos los clubs
  if (isSuperAdmin) {
    return this.prisma.club.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            category: true,
            season: true,
          },
        },
      },
    })
  }

// Si no, los clubs donde es miembro (ClubMember) O tiene algún TeamMembership
const clubMembers = await this.prisma.clubMember.findMany({
  where: {
    userId: userId,
    isActive: true,
  },
  include: {
    club: {
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            category: true,
            season: true,
          },
        },
      },
    },
  },
})

// Clubs adicionales vía TeamMembership (por si no está como ClubMember)
const memberships = await this.prisma.teamMembership.findMany({
  where: {
    userId,
    status: 'ACTIVE',
  },
  include: {
    team: {
      include: {
        club: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            teams: {
              select: {
                id: true,
                name: true,
                category: true,
                season: true,
              },
            },
          },
        },
      },
    },
  },
})

// Merge y deduplicar por club.id
const clubMap = new Map<string, any>()
for (const cm of clubMembers) clubMap.set(cm.club.id, cm.club)
for (const m of memberships) {
  const club = m.team.club
  if (!clubMap.has(club.id)) clubMap.set(club.id, club)
}

return Array.from(clubMap.values())
}

  async findOne(userId: string, clubId: string) {
const member = await this.prisma.clubMember.findFirst({
  where: {
    userId: userId,
    clubId: clubId,
    isActive: true,
  },
});

// Si no es ClubMember, comprobar si tiene TeamMembership activa en algún equipo del club
if (!member) {
  const hasMembership = await this.prisma.teamMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      team: { clubId },
    },
  });

  if (!hasMembership) {
    throw new ForbiddenException('No tienes acceso a este club');
  }
}

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        teams: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            players: true,
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club no encontrado');
    }

    return club;
  }

  async update(userId: string, clubId: string, updateClubDto: UpdateClubDto) {
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este club');
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: updateClubDto,
    });
  }

  async remove(userId: string, clubId: string) {
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('No tienes permisos para eliminar este club');
    }

    return this.prisma.club.delete({
      where: { id: clubId },
    });
  }


  // ============================================
  // GESTIÓN DE MIEMBROS DEL CLUB
  // ============================================

  async getMembers(userId: string, clubId: string) {
      // Verificar que el usuario es miembro del club o SUPER_ADMIN
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        isActive: true,
      },
    })

  if (!member && !isSuperAdmin) {
    throw new ForbiddenException('No tienes acceso a este club')
  }

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })
  }

    async inviteMember(userId: string, clubId: string, email: string, role: string) {
    // ✅ Verificar si es SUPER_ADMIN
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    // Verificar que el usuario es ADMIN_CLUB del club o SUPER_ADMIN
    const admin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (!admin && !isSuperAdmin) {
      throw new ForbiddenException('Solo los administradores del club pueden invitar miembros')
    }

    // ✅ Buscar el usuario a invitar por email
    const userToInvite = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!userToInvite) {
      throw new NotFoundException('Usuario no encontrado. Primero debe registrarse en la app.')
    }

    // Verificar si ya es miembro
    const existingMember = await this.prisma.clubMember.findFirst({
      where: {
        userId: userToInvite.id,
        clubId: clubId,
      },
    })

    if (existingMember) {
      if (!existingMember.isActive) {
        return this.prisma.clubMember.update({
          where: { id: existingMember.id },
          data: { isActive: true, role: role as any },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                lastName: true,
              },
            },
          },
        })
      }
      throw new ForbiddenException('El usuario ya es miembro del club')
    }

    return this.prisma.clubMember.create({
      data: {
        userId: userToInvite.id,
        clubId: clubId,
        role: role as any,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
          },
        },
      },
    })
  }

  async updateMemberRole(userId: string, clubId: string, memberId: string, newRole: string) {

      const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

    const admin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

  if (!admin && !isSuperAdmin) {
    throw new ForbiddenException('Solo los administradores del club pueden cambiar roles')
  }

    return this.prisma.clubMember.update({
      where: { id: memberId },
      data: { role: newRole as any },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
          },
        },
      },
    })
  }

  async removeMember(userId: string, clubId: string, memberId: string) {
      const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    const admin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

  if (!admin && !isSuperAdmin) {
    throw new ForbiddenException('Solo los administradores del club pueden eliminar miembros')
  }
    const memberToDelete = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    })

    if (memberToDelete?.userId === userId) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo del club')
    }

  // ✅ Regla: No se puede eliminar al último ADMIN_CLUB
  if (memberToDelete?.role === 'ADMIN_CLUB') {
    const adminCount = await this.prisma.clubMember.count({
      where: {
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (adminCount <= 1) {
      throw new ForbiddenException('No puedes eliminar al último administrador del club. Promueve a otro miembro primero.')
    }
  }

  const deletedMember = await this.prisma.clubMember.delete({
    where: { id: memberId },
  })

  // ✅ Regla: Si solo queda un miembro, ese debe ser ADMIN_CLUB
  const remainingMembers = await this.prisma.clubMember.findMany({
    where: { clubId, isActive: true },
  })

  if (remainingMembers.length === 1 && remainingMembers[0].role !== 'ADMIN_CLUB') {
    await this.prisma.clubMember.update({
      where: { id: remainingMembers[0].id },
      data: { role: 'ADMIN_CLUB' },
    })
  }

  return deletedMember


}
  // ============================================
  // RESETEO DE CONTRASEÑA DE MIEMBROS DEL CLUB
  // ============================================

  async resetMemberPassword(
    userId: string,
    clubId: string,
    memberId: string,
    newPassword: string,
  ) {
    // Verificar permisos: ADMIN_CLUB del club o SUPER_ADMIN
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (!isClubAdmin && !isSuperAdmin) {
      throw new ForbiddenException('Solo los administradores del club pueden resetear contraseñas')
    }

    // Buscar el miembro
    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    })

    if (!member) {
      throw new NotFoundException('Miembro no encontrado')
    }

    // Verificar que el miembro pertenece al club
    if (member.clubId !== clubId) {
      throw new ForbiddenException('Este miembro no pertenece a tu club')
    }

    // Hashear la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Actualizar contraseña
    await this.prisma.user.update({
      where: { id: member.userId },
      data: { password: hashedPassword },
    })

    // Revocar todos los refresh tokens del usuario
    await this.prisma.refreshToken.updateMany({
      where: { userId: member.userId },
      data: { isRevoked: true },
    })

    return { message: 'Contraseña reseteada correctamente' }
  }
// ============================================
// GESTIÓN DE EQUIPOS POR MIEMBRO
// ============================================

async getMemberTeams(userId: string, clubId: string, memberId: string) {
  // Verificar que el usuario es ADMIN_CLUB o SUPER_ADMIN
  const currentUser = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  const isClubAdmin = await this.prisma.clubMember.findFirst({
    where: {
      userId: userId,
      clubId: clubId,
      role: 'ADMIN_CLUB',
      isActive: true,
    },
  })

  if (!isClubAdmin && !isSuperAdmin) {
    throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
  }

  // Obtener el miembro
  const member = await this.prisma.clubMember.findUnique({
    where: { id: memberId },
  })

  if (!member) {
    throw new NotFoundException('Miembro no encontrado')
  }

  // Obtener los equipos del club
  const allTeams = await this.prisma.team.findMany({
    where: { clubId },
    orderBy: { name: 'asc' },
  })

  // Obtener los equipos a los que está asignado el miembro
  const memberTeams = await this.prisma.teamMember.findMany({
    where: {
      userId: member.userId,
      isActive: true,
      team: { clubId },
    },
    select: {
      teamId: true,
      role: true,
    },
  })

  const memberTeamIds = memberTeams.map(mt => mt.teamId)

  return allTeams.map(team => ({
    id: team.id,
    name: team.name,
    category: team.category,
    isAssigned: memberTeamIds.includes(team.id),
    role: memberTeams.find(mt => mt.teamId === team.id)?.role || null,
  }))
}

async addMemberToTeam(userId: string, clubId: string, memberId: string, teamId: string) {
  // Verificar permisos
  const currentUser = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  const isClubAdmin = await this.prisma.clubMember.findFirst({
    where: {
      userId: userId,
      clubId: clubId,
      role: 'ADMIN_CLUB',
      isActive: true,
    },
  })

  if (!isClubAdmin && !isSuperAdmin) {
    throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
  }

  // Verificar que el equipo pertenece al club
  const team = await this.prisma.team.findFirst({
    where: { id: teamId, clubId },
  })

  if (!team) {
    throw new NotFoundException('Equipo no encontrado en este club')
  }

  // Obtener el miembro
  const member = await this.prisma.clubMember.findUnique({
    where: { id: memberId },
  })

  if (!member) {
    throw new NotFoundException('Miembro no encontrado')
  }

  // Verificar si ya está asignado
  const existing = await this.prisma.teamMember.findFirst({
    where: {
      userId: member.userId,
      teamId: teamId,
    },
  })

  if (existing) {
    if (!existing.isActive) {
      return this.prisma.teamMember.update({
        where: { id: existing.id },
        data: { isActive: true },
      })
    }
    throw new ForbiddenException('El miembro ya está asignado a este equipo')
  }

  return this.prisma.teamMember.create({
    data: {
      userId: member.userId,
      teamId: teamId,
      role: 'COACH',
    },
  })
}

async removeMemberFromTeam(userId: string, clubId: string, memberId: string, teamId: string) {
  // Verificar permisos
  const currentUser = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  const isClubAdmin = await this.prisma.clubMember.findFirst({
    where: {
      userId: userId,
      clubId: clubId,
      role: 'ADMIN_CLUB',
      isActive: true,
    },
  })

  if (!isClubAdmin && !isSuperAdmin) {
    throw new ForbiddenException('Solo los administradores del club pueden gestionar equipos')
  }

  // Obtener el miembro
  const member = await this.prisma.clubMember.findUnique({
    where: { id: memberId },
  })

  if (!member) {
    throw new NotFoundException('Miembro no encontrado')
  }

  // Buscar la asignación
  const teamMember = await this.prisma.teamMember.findFirst({
    where: {
      userId: member.userId,
      teamId: teamId,
    },
  })

  if (!teamMember) {
    throw new NotFoundException('El miembro no está asignado a este equipo')
  }

  return this.prisma.teamMember.delete({
    where: { id: teamMember.id },
  })
}
  // ============================================
  // SUBIR LOGO DEL CLUB
  // ============================================

  async uploadLogo(userId: string, clubId: string, base64Image: string) {
    // Verificar permisos
    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId,
        role: 'ADMIN_CLUB',
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este club')
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
    })

    if (!club) {
      throw new NotFoundException('Club no encontrado')
    }

    // Subir imagen a Cloudinary
    const { url } = await this.cloudinaryService.uploadImage(
      base64Image,
      `training-pro/clubs/${clubId}`,
    )

    // Actualizar club con la nueva URL
    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: url },
    })
  }

  async removeLogo(userId: string, clubId: string) {
    const member = await this.prisma.clubMember.findFirst({
      where: { userId, clubId, role: 'ADMIN_CLUB', isActive: true },
    })
    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este club')
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: null },
    })
  }
  // ============================================
  // JUGADORES DEL CLUB (vista global)
  // ============================================

  /**
   * Devuelve todos los jugadores (Users con rol PLAYER activo) de todos los
   * equipos del club. Cada jugador aparece UNA SOLA VEZ aunque esté en varios
   * equipos del club; en ese caso, `memberships` tendrá varios elementos.
   *
   * Solo accesible para miembros activos del club.
   */
  async findClubPlayers(userId: string, clubId: string) {
    // 1) Verificar permisos: miembro activo del club o super admin
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

    if (!isSuperAdmin) {
      const member = await this.prisma.clubMember.findFirst({
        where: {
          userId,
          clubId,
          isActive: true,
        },
      })

      if (!member) {
        throw new ForbiddenException('No tienes acceso a este club')
      }
    }

    // 2) Buscar Users con membership PLAYER activo en algún equipo del club
    const players = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: {
            role: 'PLAYER',
            status: 'ACTIVE',
            team: { clubId },
          },
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        lastName: true,
        avatar: true,
        bio: true,
        isGhost: true,
        memberships: {
          where: {
            role: 'PLAYER',
            status: 'ACTIVE',
            team: { clubId },
          },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                sport: true,
                category: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { name: 'asc' }],
    })

    // 3) Aplanar: cada jugador con un array de memberships resumido
    return players.map((player) => ({
      id: player.id,
      username: player.username,
      name: player.name,
      lastName: player.lastName,
      avatar: player.avatar,
      bio: player.bio,
      isGhost: player.isGhost,
      memberships: player.memberships.map((m) => ({
        id: m.id,
        teamId: m.team.id,
        teamName: m.team.name,
        teamSport: m.team.sport,
        teamCategory: m.team.category,
        jerseyNumber: m.jerseyNumber,
        position: m.position,
        joinedAt: m.joinedAt,
      })),
    }))
  }

}