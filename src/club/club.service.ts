// backend/src/club/club.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { generateUniqueUsername } from '../user/utils/generate-username';
import {
  isSuperAdmin,
  isClubAdmin,
  isActiveClubMember,
  canInviteToClub,
  getViewerPrivateDataScope,
  type ViewerPrivateDataScope,
} from '../common/access';
import {
  resolveClubRoleId,
  resolveTeamRoleId,
} from '../permissions/resolve-role-id';
import {
  normalizeClubMemberRoleList,
  normalizeMembershipRolesList,
} from '../common/serialize';

const OPTIONAL_CLUB_STRING_FIELDS = [
  'description',
  'address',
  'phone',
  'email',
] as const;

function normalizeOptionalClubStrings<T extends Record<string, any>>(
  data: T,
): T {
  const out: any = { ...data };
  for (const key of OPTIONAL_CLUB_STRING_FIELDS) {
    if (key in out) {
      const v = out[key];
      if (typeof v === 'string' && v.trim() === '') {
        out[key] = null;
      }
    }
  }
  return out;
}

@Injectable()
export class ClubService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private mailService: MailService,
  ) {}

  // ─────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────

  private buildPrivateDataFilter(
    viewerId: string,
    scope: ViewerPrivateDataScope,
  ): (target: { id: string; clubId?: string; teamId?: string }) => boolean {
    return (target) => {
      if (viewerId === target.id) return true;
      if (scope.isSuperAdmin) return true;
      if (scope.tutorOfUserIds.includes(target.id)) return true;
      if (target.clubId && scope.adminClubIds.includes(target.clubId)) {
        return true;
      }
      if (target.teamId && scope.staffTeamIds.includes(target.teamId)) {
        return true;
      }
      return false;
    };
  }

  private filterUserPrivateFields<
    T extends { id: string; email?: string | null; phone?: string | null },
  >(
    user: T,
    canSee: (target: { id: string; clubId?: string; teamId?: string }) => boolean,
    ctx: { clubId?: string; teamId?: string } = {},
  ): T {
    if (canSee({ id: user.id, ...ctx })) return user;
    const { email: _e, phone: _p, ...rest } = user;
    return rest as T;
  }

  // ─────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────

  async create(userId: string, createClubDto: CreateClubDto) {
    const data = normalizeOptionalClubStrings(createClubDto);

    const cleanColors: { primaryColor?: string; secondaryColor?: string } = {};
    if (data.primaryColor && data.primaryColor.trim() !== '') {
      cleanColors.primaryColor = data.primaryColor;
    }
    if (data.secondaryColor && data.secondaryColor.trim() !== '') {
      cleanColors.secondaryColor = data.secondaryColor;
    }

    // ✅ NUEVO — Solo el SUPER_ADMIN puede fijar una licencia distinta a BETA
    // al crear un club. Si no es SUPER_ADMIN o no envía `licenseType`,
    // se aplica el @default(BETA) del schema.
    const superAdmin = await isSuperAdmin(this.prisma, userId);
    const licenseOverride =
      superAdmin && data.licenseType ? { licenseType: data.licenseType } : {};

    let club;
    try {
      club = await this.prisma.$transaction(
        async (tx) => {
          const created = await tx.club.create({
            data: {
              name: data.name,
              description: data.description,
              address: data.address,
              phone: data.phone,
              email: data.email,
              ...cleanColors,
              ...licenseOverride,
            },
          });

          const { seedSystemRolesForClub } = await import(
            '../permissions/seed-roles'
          );
          await seedSystemRolesForClub(tx, created.id);

          let adminRoleId: string;
          try {
            adminRoleId = await resolveClubRoleId(
              tx,
              created.id,
              'ADMIN_CLUB',
            );
          } catch (resolveErr) {
            console.error('❌ resolveClubRoleId falló:', resolveErr);
            const fallback = await tx.role.upsert({
              where: {
                clubId_scope_name: {
                  clubId: created.id,
                  scope: 'CLUB',
                  name: 'ADMIN_CLUB',
                },
              },
              create: {
                clubId: created.id,
                scope: 'CLUB',
                name: 'ADMIN_CLUB',
                description: 'Administrador del club',
                isSystem: true,
              },
              update: {},
            });
            adminRoleId = fallback.id;
          }

          const clubMember = await tx.clubMember.create({
            data: {
              userId,
              clubId: created.id,
              roleId: adminRoleId,
              isActive: true,
            },
          });

          await tx.clubMemberRole.create({
            data: {
              clubMemberId: clubMember.id,
              roleId: adminRoleId,
              scope: 'ALL',
            },
          });

          return tx.club.findUniqueOrThrow({
            where: { id: created.id },
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
                  roleRef: { select: { id: true, name: true } },
                  clubMemberRoles: {
                    include: {
                      roleRef: { select: { id: true, name: true } },
                      teamScopes: {
                        include: { team: { select: { id: true, name: true } } },
                      },
                    },
                  },
                },
              },
            },
          });
        },
        { timeout: 15000 },
      );
    } catch (err: any) {
      console.error('🔴 Error creando club:', {
        code: err?.code,
        message: err?.message,
        meta: err?.meta,
      });
      throw err;
    }

    const creator = club.members.find((m) => m.userId === userId)?.user;
    this.mailService
      .sendAdminNotification({
        eventTitle: 'Nuevo club creado',
        icon: '🏛️',
        fields: [
          { label: 'Club', value: club.name },
          {
            label: 'Creador',
            value: creator
              ? `${creator.name} ${creator.lastName}`
              : '(desconocido)',
          },
          {
            label: 'Email creador',
            value: creator?.email ?? '(sin email)',
          },
          { label: 'ID', value: club.id },
        ],
      })
      .catch((err) =>
        console.error('Error notificando creación de club:', err),
      );

    return club;
  }

  async findAll(userId: string) {
    const scope = await getViewerPrivateDataScope(this.prisma, userId);
    const canSee = this.buildPrivateDataFilter(userId, scope);

    if (scope.isSuperAdmin) {
      const clubs = await this.prisma.club.findMany({
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
              roleRef: { select: { id: true, name: true } },
            },
          },
          teams: {
            select: { id: true, name: true, category: true, season: true },
          },
        },
      });

      return clubs.map((club) => ({
        ...club,
        members: normalizeClubMemberRoleList(club.members),
      }));
    }

    const clubMembers = await this.prisma.clubMember.findMany({
      where: { userId, isActive: true },
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
                roleRef: { select: { id: true, name: true } },
              },
            },
            teams: {
              select: { id: true, name: true, category: true, season: true },
            },
          },
        },
      },
    });

    const memberships = await this.prisma.teamMembership.findMany({
      where: { userId, status: 'ACTIVE' },
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
                    roleRef: { select: { id: true, name: true } },
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
    });

    const clubMap = new Map<string, any>();
    for (const cm of clubMembers) clubMap.set(cm.club.id, cm.club);
    for (const m of memberships) {
      const club = m.team.club;
      if (!clubMap.has(club.id)) clubMap.set(club.id, club);
    }

    const result = Array.from(clubMap.values());

    return result.map((club: any) => ({
      ...club,
      members: normalizeClubMemberRoleList(
        (club.members ?? []).map((m: any) =>
          m.user
            ? {
                ...m,
                user: this.filterUserPrivateFields(m.user, canSee, {
                  clubId: club.id,
                }),
              }
            : m,
        ),
      ),
    }));
  }

  async findOne(userId: string, clubId: string) {
    const scope = await getViewerPrivateDataScope(this.prisma, userId);
    const canSee = this.buildPrivateDataFilter(userId, scope);

    if (!scope.isSuperAdmin) {
      const isActive = await isActiveClubMember(this.prisma, userId, clubId);
      if (!isActive) {
        const hasMembership = await this.prisma.teamMembership.findFirst({
          where: { userId, status: 'ACTIVE', team: { clubId } },
        });
        if (!hasMembership) {
          throw new ForbiddenException('No tienes acceso a este club');
        }
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
            roleRef: { select: { id: true, name: true } },
            clubMemberRoles: {
              include: {
                roleRef: { select: { id: true, name: true } },
                teamScopes: {
                  include: { team: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
        teams: {
          include: {
            memberships: {
              where: {
                status: 'ACTIVE',
                roles: { some: { roleRef: { name: 'PLAYER' } } },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club no encontrado');
    }

    return {
      ...club,
      members: normalizeClubMemberRoleList(
        (club.members ?? []).map((m) =>
          m.user
            ? {
                ...m,
                user: this.filterUserPrivateFields(m.user, canSee, {
                  clubId: club.id,
                }),
              }
            : m,
        ),
      ),
    };
  }

  async update(userId: string, clubId: string, updateClubDto: UpdateClubDto) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'No tienes permisos para editar este club',
        );
      }
    }

    const data = normalizeOptionalClubStrings(updateClubDto);

    // ✅ NUEVO — Solo el SUPER_ADMIN puede cambiar `licenseType`.
    // Si un ADMIN_CLUB (u otro rol con permiso de edición) lo envía,
    // se ignora silenciosamente.
    const superAdmin = await isSuperAdmin(this.prisma, userId);
    if (!superAdmin && 'licenseType' in data) {
      delete (data as any).licenseType;
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data,
    });
  }

  async remove(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'No tienes permisos para eliminar este club',
        );
      }
    }

    return this.prisma.club.delete({
      where: { id: clubId },
    });
  }

  // ─────────────────────────────────────────────
  // MIEMBROS
  // ─────────────────────────────────────────────

  async getMembers(userId: string, clubId: string) {
    const scope = await getViewerPrivateDataScope(this.prisma, userId);
    const canSee = this.buildPrivateDataFilter(userId, scope);

    const isSuper = scope.isSuperAdmin;
    const isActive = await isActiveClubMember(this.prisma, userId, clubId);

    if (!isActive && !isSuper) {
      throw new ForbiddenException('No tienes acceso a este club');
    }

    const members = await this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
            lastName: true,
          },
        },
        roleRef: { select: { id: true, name: true } },
        clubMemberRoles: {
          include: {
            roleRef: { select: { id: true, name: true } },
            teamScopes: {
              include: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const filtered = members.map((m) =>
      m.user
        ? {
            ...m,
            user: this.filterUserPrivateFields(m.user, canSee, { clubId }),
          }
        : m,
    );

    return normalizeClubMemberRoleList(filtered);
  }

  async inviteMember(
    userId: string,
    clubId: string,
    email: string,
    role: string,
  ) {
    if (!(await canInviteToClub(this.prisma, userId, clubId))) {
      throw new ForbiddenException(
        'Solo los administradores del club pueden invitar miembros',
      );
    }

    const userToInvite = await this.prisma.user.findUnique({ where: { email } });
    if (!userToInvite) {
      throw new NotFoundException(
        'Usuario no encontrado. Primero debe registrarse en la app.',
      );
    }

    const roleId = await resolveClubRoleId(this.prisma, clubId, role);

    const existingMember = await this.prisma.clubMember.findFirst({
      where: { userId: userToInvite.id, clubId },
    });

    if (existingMember) {
      if (!existingMember.isActive) {
        return this.prisma.clubMember.update({
          where: { id: existingMember.id },
          data: { isActive: true, roleId },
          include: {
            user: {
              select: { id: true, email: true, name: true, lastName: true },
            },
          },
        });
      }
      throw new ForbiddenException('El usuario ya es miembro del club');
    }

    return this.prisma.clubMember.create({
      data: {
        userId: userToInvite.id,
        clubId,
        roleId,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastName: true },
        },
      },
    });
  }

  async updateMemberRole(
    userId: string,
    clubId: string,
    memberId: string,
    newRole: string,
  ) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden cambiar roles',
        );
      }
    }

    const roleId = await resolveClubRoleId(this.prisma, clubId, newRole);

    return this.prisma.clubMember.update({
      where: { id: memberId },
      data: { roleId },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastName: true },
        },
      },
    });
  }

  async updateMemberRoles(
    actorId: string,
    clubId: string,
    memberId: string,
    roleAssignments: { name: string; scope: 'ALL' | 'TEAMS'; teamIds?: string[] }[],
  ) {
    if (!(await isSuperAdmin(this.prisma, actorId))) {
      if (!(await isClubAdmin(this.prisma, actorId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden cambiar roles',
        );
      }
    }

    if (!Array.isArray(roleAssignments) || roleAssignments.length === 0) {
      throw new BadRequestException('El miembro debe tener al menos un rol');
    }

    const cleanAssignments = roleAssignments.map((a) => ({
      name: typeof a.name === 'string' ? a.name.trim() : '',
      scope: a.scope === 'TEAMS' ? 'TEAMS' : 'ALL',
      teamIds: Array.isArray(a.teamIds) ? a.teamIds : [],
    })).filter(a => a.name.length > 0);
    
    const cleanNames = Array.from(new Set(cleanAssignments.map(a => a.name)));

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
      select: { id: true, clubId: true, userId: true },
    });
    if (!member) {
      throw new NotFoundException('Miembro no encontrado');
    }
    if (member.clubId !== clubId) {
      throw new ForbiddenException('Este miembro no pertenece a tu club');
    }

    const roles = await this.prisma.role.findMany({
      where: { clubId, name: { in: cleanNames } },
      select: { id: true, name: true, scope: true },
    });
    
    // Validaciones básicas...
    const foundNames = new Set(roles.map((r) => r.name));
    const missing = cleanNames.filter((n) => !foundNames.has(n));
    if (missing.length > 0) {
      throw new BadRequestException(`Roles no válidos para este club: ${missing.join(', ')}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Actualizar roles a nivel de club (ClubMemberRole)
      await tx.clubMemberRole.deleteMany({
        where: { clubMemberId: memberId },
      });

      for (const assignment of cleanAssignments) {
        const roleRef = roles.find((r) => r.name === assignment.name);
        if (!roleRef) continue;
        const hasTeams = assignment.teamIds.length > 0;
        const scope = assignment.scope || (hasTeams ? 'TEAMS' : 'ALL');

        await tx.clubMemberRole.create({
          data: {
            clubMemberId: memberId,
            roleId: roleRef.id,
            scope: scope,
            ...(hasTeams
              ? { teamScopes: { create: assignment.teamIds.map((tId) => ({ teamId: tId })) } }
              : {}),
          },
        });
      }

      const legacyRole = roles.find(r => r.name === cleanNames[0])!;
      await tx.clubMember.update({
        where: { id: memberId },
        data: { roleId: legacyRole.id },
      });

      // 2. Sincronizar equipos (TeamMembership)
      // Leemos los equipos actuales del usuario
      const currentMemberships = await tx.teamMembership.findMany({
        where: { userId: member.userId, team: { clubId } },
        select: { id: true, teamId: true, status: true, roles: { select: { roleId: true } } },
      });

      // ¿Qué roles de equipo tiene en el payload?
      const teamRolesInPayload = cleanAssignments.filter(a => {
        const r = roles.find(x => x.name === a.name);
        return r && r.scope === 'TEAM';
      });

      const allTeamsOfClub = await tx.team.findMany({
        where: { clubId },
        select: { id: true },
      });
      const allTeamIdsOfClub = allTeamsOfClub.map(t => t.id);

      const desiredRolesByTeam = new Map<string, Set<string>>();

      for (const assignment of teamRolesInPayload) {
        const roleRef = roles.find(r => r.name === assignment.name)!;
        
        let targetTeams: string[] = [];
        
        if (assignment.scope === 'ALL') {
          targetTeams = allTeamIdsOfClub;
        } else if (assignment.teamIds.length > 0) {
          targetTeams = assignment.teamIds;
        } else {
          // Si es scope TEAMS pero no mandaron equipos en el payload,
          // mantenemos los equipos donde el usuario YA estaba.
          const currentTeamsForThisUser = currentMemberships
            .filter(m => m.status === 'ACTIVE')
            .map(m => m.teamId);
          targetTeams = currentTeamsForThisUser;
        }

        for (const tId of targetTeams) {
          if (!desiredRolesByTeam.has(tId)) desiredRolesByTeam.set(tId, new Set());
          desiredRolesByTeam.get(tId)!.add(roleRef.id);
        }
      }

      // Si desiredRolesByTeam está vacío, significa que no hay roles de equipo (solo roles de club).
      // En ese caso, NO tocamos las membresías del usuario.
      if (desiredRolesByTeam.size > 0) {
        // Desactivar las que ya no estén en la lista
        for (const m of currentMemberships) {
          if (!desiredRolesByTeam.has(m.teamId) && m.status === 'ACTIVE') {
            await tx.teamMembership.update({
              where: { id: m.id },
              data: { status: 'LEFT', leftAt: new Date() },
            });
          }
        }

        // Crear o actualizar las que sí están
        for (const [tId, roleIds] of desiredRolesByTeam.entries()) {
          const existing = currentMemberships.find(m => m.teamId === tId);
          if (!existing) {
            await tx.teamMembership.create({
              data: {
                userId: member.userId,
                teamId: tId,
                status: 'ACTIVE',
                roles: { create: Array.from(roleIds).map(id => ({ roleId: id })) },
              },
            });
          } else {
            await tx.teamMembership.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                leftAt: null,
                roles: {
                  deleteMany: {},
                  create: Array.from(roleIds).map(id => ({ roleId: id })),
                },
              },
            });
          }
        }
      }

      return tx.clubMember.findUniqueOrThrow({
        where: { id: memberId },
        include: {
          user: { select: { id: true, name: true, lastName: true, email: true } },
          roleRef: { select: { id: true, name: true } },
          clubMemberRoles: {
            include: { roleRef: { select: { id: true, name: true } }, teamScopes: { include: { team: { select: { id: true, name: true } } } } },
          },
        },
      });
    });
  }

  async removeMember(userId: string, clubId: string, memberId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden eliminar miembros',
        );
      }
    }

    const memberToDelete = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
      include: { roleRef: { select: { name: true } } },
    });

    if (!memberToDelete) {
      throw new NotFoundException('Miembro no encontrado');
    }

    if (memberToDelete.userId === userId) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo del club');
    }

    if (memberToDelete.roleRef.name === 'ADMIN_CLUB') {
      const adminCount = await this.prisma.clubMember.count({
        where: {
          clubId,
          isActive: true,
          roleRef: { name: 'ADMIN_CLUB' },
        },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'No puedes eliminar al último administrador del club. Promueve a otro miembro primero.',
        );
      }
    }

    await this.prisma.teamMembership.updateMany({
      where: {
        userId: memberToDelete.userId,
        status: 'ACTIVE',
        team: { clubId },
      },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    });

    const deletedMember = await this.prisma.clubMember.delete({
      where: { id: memberId },
    });

    const remainingMembers = await this.prisma.clubMember.findMany({
      where: { clubId, isActive: true },
      include: { roleRef: { select: { name: true } } },
    });

    if (
      remainingMembers.length === 1 &&
      remainingMembers[0].roleRef.name !== 'ADMIN_CLUB'
    ) {
      const adminRoleId = await resolveClubRoleId(
        this.prisma,
        clubId,
        'ADMIN_CLUB',
      );
      await this.prisma.clubMember.update({
        where: { id: remainingMembers[0].id },
        data: { roleId: adminRoleId },
      });
    }

    return deletedMember;
  }

  async resetMemberPassword(
    userId: string,
    clubId: string,
    memberId: string,
    newPassword: string,
  ) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden resetear contraseñas',
        );
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!member) {
      throw new NotFoundException('Miembro no encontrado');
    }

    if (member.clubId !== clubId) {
      throw new ForbiddenException('Este miembro no pertenece a tu club');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: member.userId },
      data: { password: hashedPassword },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: member.userId },
      data: { isRevoked: true },
    });

    return { message: 'Contraseña reseteada correctamente' };
  }

  async getMemberTeams(userId: string, clubId: string, memberId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden gestionar equipos',
        );
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Miembro no encontrado');
    }

    const allTeams = await this.prisma.team.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });

    const memberMemberships = await this.prisma.teamMembership.findMany({
      where: {
        userId: member.userId,
        status: 'ACTIVE',
        team: { clubId },
      },
      select: {
        teamId: true,
        roles: { include: { roleRef: { select: { name: true } } } },
      },
    });

    const membershipMap = new Map(
      memberMemberships.map((m) => {
        const normalized = normalizeMembershipRolesList([m])[0];
        return [m.teamId, normalized.roles.join(', ') || 'PLAYER'];
      }),
    );

    return allTeams.map((team) => ({
      id: team.id,
      name: team.name,
      category: team.category,
      isAssigned: membershipMap.has(team.id),
      role: membershipMap.get(team.id) ?? null,
    }));
  }

  async addMemberToTeam(
    userId: string,
    clubId: string,
    memberId: string,
    teamId: string,
  ) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden gestionar equipos',
        );
      }
    }

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, clubId },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado en este club');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Miembro no encontrado');
    }

    const coachTeamRoleId = await resolveTeamRoleId(
      this.prisma,
      clubId,
      'COACH',
    );

    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId: member.userId, teamId },
    });

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new ForbiddenException(
          'El miembro ya está asignado a este equipo',
        );
      }
      return this.prisma.teamMembership.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          leftAt: null,
          joinedAt: new Date(),
          roles: {
            deleteMany: {},
            create: [{ roleId: coachTeamRoleId }],
          },
        },
      });
    }

    return this.prisma.teamMembership.create({
      data: {
        userId: member.userId,
        teamId,
        status: 'ACTIVE',
        roles: { create: [{ roleId: coachTeamRoleId }] },
      },
    });
  }

  async removeMemberFromTeam(
    userId: string,
    clubId: string,
    memberId: string,
    teamId: string,
  ) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden gestionar equipos',
        );
      }
    }

    const member = await this.prisma.clubMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Miembro no encontrado');
    }

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId: member.userId, teamId, status: 'ACTIVE' },
    });

    if (!membership) {
      throw new NotFoundException(
        'El miembro no está asignado a este equipo',
      );
    }

    return this.prisma.teamMembership.update({
      where: { id: membership.id },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    });
  }

  async uploadLogo(userId: string, clubId: string, base64Image: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'No tienes permisos para editar este club',
        );
      }
    }

    const club = await this.prisma.club.findUnique({ where: { id: clubId } });

    if (!club) {
      throw new NotFoundException('Club no encontrado');
    }

    const { url } = await this.cloudinaryService.uploadImage(
      base64Image,
      `training-pro/clubs/${clubId}`,
    );

    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: url },
    });
  }

  async removeLogo(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      if (!(await isClubAdmin(this.prisma, userId, clubId))) {
        throw new ForbiddenException(
          'No tienes permisos para editar este club',
        );
      }
    }

    return this.prisma.club.update({
      where: { id: clubId },
      data: { logo: null },
    });
  }

  async findClubPlayers(userId: string, clubId: string) {
    if (!(await isSuperAdmin(this.prisma, userId))) {
      const isActive = await isActiveClubMember(
        this.prisma,
        userId,
        clubId,
      );
      if (!isActive) {
        throw new ForbiddenException('No tienes acceso a este club');
      }
    }

    const players = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: {
            roles: { some: { roleRef: { name: 'PLAYER' } } },
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
            roles: { some: { roleRef: { name: 'PLAYER' } } },
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
    });

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
    }));
  }

  async getRemindersConfig(viewerId: string, clubId: string) {
    const isMember = await isActiveClubMember(
      this.prisma,
      viewerId,
      clubId,
    );
    const isSuper = await isSuperAdmin(this.prisma, viewerId);
    if (!isMember && !isSuper) {
      throw new ForbiddenException('No tienes acceso a este club');
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        paymentRemindersEnabled: true,
      },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    const cronExpr = process.env.PAYMENT_REMINDERS_CRON || '0 9 * * *';
    const globalEnabled =
      process.env.PAYMENT_REMINDERS_ENABLED === undefined
        ? true
        : process.env.PAYMENT_REMINDERS_ENABLED === 'true';

    return {
      clubId: club.id,
      clubName: club.name,
      enabled: club.paymentRemindersEnabled,
      globalEnabled,
      cronExpression: cronExpr,
      scheduledHour: this.parseCronHour(cronExpr),
      description:
        'Los recordatorios se envían automáticamente a los jugadores con pagos pendientes. Se ejecutan una vez al día.',
    };
  }

  async updatePaymentReminders(
    viewerId: string,
    clubId: string,
    enabled: boolean,
  ) {
    const isSuper = await isSuperAdmin(this.prisma, viewerId);
    const isAdmin = await isClubAdmin(this.prisma, viewerId, clubId);
    if (!isSuper && !isAdmin) {
      throw new ForbiddenException(
        'Solo los administradores del club pueden cambiar esta configuración',
      );
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: { paymentRemindersEnabled: enabled },
      select: {
        id: true,
        name: true,
        paymentRemindersEnabled: true,
      },
    });

    return {
      clubId: updated.id,
      clubName: updated.name,
      enabled: updated.paymentRemindersEnabled,
    };
  }

  async createMemberWithRoles(
    actorId: string,
    clubId: string,
    dto: { email?: string; name?: string; lastName?: string; phone?: string; roles: { name: string; scope: 'ALL' | 'TEAMS'; teamIds?: string[] }[] },
  ) {
    if (!(await isSuperAdmin(this.prisma, actorId))) {
      if (!(await isClubAdmin(this.prisma, actorId, clubId))) {
        throw new ForbiddenException(
          'Solo los administradores del club pueden añadir miembros',
        )
      }
    }

    if (!dto.roles || dto.roles.length === 0) {
      throw new BadRequestException('Debes asignar al menos un rol')
    }

    const cleanNames = dto.roles.map(r => r.name)
    const roles = await this.prisma.role.findMany({
      where: { clubId, name: { in: cleanNames } },
      select: { id: true, name: true, scope: true },
    })
    const missing = cleanNames.filter(n => !roles.some(r => r.name === n))
    if (missing.length > 0) {
      throw new BadRequestException(`Roles no válidos: ${missing.join(', ')}`)
    }

    let user = dto.email 
      ? await this.prisma.user.findUnique({ where: { email: dto.email } })
      : null

    if (!user) {
      const username = await generateUniqueUsername(
        this.prisma,
        dto.name || 'Usuario',
        dto.lastName || 'Invitado',
      )
      user = await this.prisma.user.create({
        data: {
          email: dto.email || null,
          name: dto.name || 'Usuario',
          lastName: dto.lastName || 'Invitado',
          phone: dto.phone || null,
          isGhost: true,
          username,
        },
      })
    }

    const existingMember = await this.prisma.clubMember.findUnique({
      where: { userId_clubId: { userId: user.id, clubId } },
    })
    if (existingMember && existingMember.isActive) {
      throw new BadRequestException('El usuario ya es miembro del club')
    }

    const legacyRoleName = cleanNames.includes('ADMIN_CLUB') ? 'ADMIN_CLUB'
      : cleanNames.includes('COACH') ? 'COACH'
      : cleanNames.includes('ASSISTANT') ? 'ASSISTANT'
      : cleanNames[0]
    const legacyRole = roles.find(r => r.name === legacyRoleName)!

    return this.prisma.$transaction(async (tx) => {
      let clubMemberId: string
      if (existingMember) {
        const updated = await tx.clubMember.update({
          where: { id: existingMember.id },
          data: { isActive: true, roleId: legacyRole.id, joinedAt: new Date() },
        })
        clubMemberId = updated.id
      } else {
        const created = await tx.clubMember.create({
          data: { userId: user!.id, clubId, roleId: legacyRole.id, isActive: true },
        })
        clubMemberId = created.id
      }

      for (const assignment of dto.roles) {
        const roleRef = roles.find(r => r.name === assignment.name)!
        const hasTeams = Array.isArray(assignment.teamIds) && assignment.teamIds.length > 0
        const scope = assignment.scope || (hasTeams ? 'TEAMS' : 'ALL')

        await tx.clubMemberRole.create({
          data: {
            clubMemberId,
            roleId: roleRef.id,
            scope: scope,
            ...(hasTeams
              ? { teamScopes: { create: assignment.teamIds!.map(tId => ({ teamId: tId })) } }
              : {}),
          },
        })
      }

      const allTeamsOfClub = await tx.team.findMany({
        where: { clubId },
        select: { id: true },
      })
      const allTeamIdsOfClub = allTeamsOfClub.map(t => t.id)

      const desiredRolesByTeam = new Map<string, Set<string>>()

      for (const assignment of dto.roles) {
        const roleRef = roles.find(r => r.name === assignment.name)
        if (!roleRef) continue
        // ✅ FIX: Solo sincronizar roles de tipo TEAM
        if (roleRef.scope !== 'TEAM') continue

        const targetTeams = assignment.scope === 'ALL' 
          ? allTeamIdsOfClub 
          : (assignment.teamIds || [])
        for (const tId of targetTeams) {
          if (!desiredRolesByTeam.has(tId)) desiredRolesByTeam.set(tId, new Set())
          desiredRolesByTeam.get(tId)!.add(roleRef.id)
        }
      }

      const currentMemberships = await tx.teamMembership.findMany({
        where: { userId: user!.id, team: { clubId } },
        select: { id: true, teamId: true, status: true },
      })

      if (desiredRolesByTeam.size > 0) {
        for (const m of currentMemberships) {
          if (!desiredRolesByTeam.has(m.teamId) && m.status === 'ACTIVE') {
            await tx.teamMembership.update({
              where: { id: m.id },
              data: { status: 'LEFT', leftAt: new Date() },
            })
          }
        }

        for (const [tId, roleIds] of desiredRolesByTeam.entries()) {
          const existing = currentMemberships.find(m => m.teamId === tId)
          if (!existing) {
            await tx.teamMembership.create({
              data: {
                userId: user!.id,
                teamId: tId,
                status: 'ACTIVE',
                roles: { create: Array.from(roleIds).map(id => ({ roleId: id })) },
              },
            })
          } else {
            await tx.teamMembership.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                leftAt: null,
                joinedAt: existing.status === 'ACTIVE' ? undefined : new Date(),
                roles: {
                  deleteMany: {},
                  create: Array.from(roleIds).map(id => ({ roleId: id })),
                },
              },
            })
          }
        }
      }

      return tx.clubMember.findUniqueOrThrow({
        where: { id: clubMemberId },
        include: {
          user: { select: { id: true, name: true, lastName: true, email: true } },
          roleRef: { select: { id: true, name: true } },
          clubMemberRoles: {
            include: { roleRef: { select: { id: true, name: true } }, teamScopes: { include: { team: { select: { id: true, name: true } } } } },
          },
        },
      })
    })
  }

  private parseCronHour(expr: string): string | null {
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (Number.isNaN(minute) || Number.isNaN(hour)) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
}