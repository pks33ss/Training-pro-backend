// backend/src/permissions/roles.service.ts
// Lote 8.3 — CRUD de roles y permisos con auditoría.
// Cualquier ADMIN_CLUB del club puede gestionar.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PermissionsService } from './permissions.service'
import { isClubAdmin, isSuperAdmin } from '../common/access'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import {
  RolePermissionInput,
  SetRolePermissionsDto,
} from './dto/set-role-permissions.dto'
import { PreviewImpactDto } from './dto/preview-impact.dto'
import type { Prisma } from '@prisma/client'

interface ActorCtx {
  actorId: string
  clubId: string
}

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  // ============================================
  // AUTORIZACIÓN
  // ============================================

  private async assertCanManageRoles(actorId: string, clubId: string) {
    if (await isSuperAdmin(this.prisma, actorId)) return
    if (await isClubAdmin(this.prisma, actorId, clubId)) return
    throw new ForbiddenException(
      'Solo los administradores del club pueden gestionar roles',
    )
  }

  // ============================================
  // LIST
  // ============================================

  async listRoles(actorId: string, clubId: string) {
    await this.assertCanManageRoles(actorId, clubId)

    const roles = await this.prisma.role.findMany({
      where: { clubId },
      include: {
        permissions: {
          select: {
            id: true,
            resource: true,
            action: true,
            scope: true,
            granted: true,
          },
          orderBy: [{ resource: 'asc' }, { action: 'asc' }],
        },
        _count: {
          select: {
            clubMembers: true,
            membershipRoles: true,
          },
        },
      },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    })

    return roles.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      scope: r.scope,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      permissions: r.permissions,
      usage: {
        clubMembers: r._count.clubMembers,
        membershipRoles: r._count.membershipRoles,
      },
    }))
  }

  async getRole(actorId: string, clubId: string, roleId: string) {
    await this.assertCanManageRoles(actorId, clubId)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, clubId },
      include: {
        permissions: {
          select: {
            id: true,
            resource: true,
            action: true,
            scope: true,
            granted: true,
          },
          orderBy: [{ resource: 'asc' }, { action: 'asc' }],
        },
        _count: {
          select: { clubMembers: true, membershipRoles: true },
        },
      },
    })
    if (!role) throw new NotFoundException('Rol no encontrado')

        const { _count, ...rest } = role
    return {
      ...rest,
      usage: {
        clubMembers: _count.clubMembers,
        membershipRoles: _count.membershipRoles,
      },
    }
  }

  // ============================================
  // CREATE
  // ============================================

  async createRole(actorId: string, clubId: string, dto: CreateRoleDto) {
    await this.assertCanManageRoles(actorId, clubId)

    const existing = await this.prisma.role.findUnique({
      where: {
        clubId_scope_name: {
          clubId,
          scope: dto.scope,
          name: dto.name,
        },
      },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException(
        `Ya existe un rol "${dto.name}" en este club para el scope ${dto.scope}`,
      )
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          clubId,
          scope: dto.scope,
          name: dto.name,
          description: dto.description ?? null,
          isSystem: false,
          isDefault: false,
        },
      })

      await tx.permissionAuditLog.create({
        data: {
          clubId,
          actorId,
          targetType: 'role',
          targetId: created.id,
          action: 'create',
          before: null as any,
          after: {
            id: created.id,
            scope: created.scope,
            name: created.name,
            description: created.description,
          } as any,
        },
      })

      return created
    })

    this.permissionsService.invalidateAll()
    return this.getRole(actorId, clubId, role.id)
  }

  // ============================================
  // UPDATE
  // ============================================

  async updateRole(
    actorId: string,
    clubId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ) {
    await this.assertCanManageRoles(actorId, clubId)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, clubId },
    })
    if (!role) throw new NotFoundException('Rol no encontrado')

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new BadRequestException(
        'No se puede renombrar un rol de sistema. Clónalo y edita el clon.',
      )
    }

    if (dto.name && dto.name !== role.name) {
      const dup = await this.prisma.role.findUnique({
        where: {
          clubId_scope_name: {
            clubId,
            scope: role.scope,
            name: dto.name,
          },
        },
        select: { id: true },
      })
      if (dup && dup.id !== roleId) {
        throw new ConflictException(
          `Ya existe un rol "${dto.name}" en este club para el scope ${role.scope}`,
        )
      }
    }

    const before = {
      name: role.name,
      description: role.description,
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.role.update({
        where: { id: roleId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
      })

      await tx.permissionAuditLog.create({
        data: {
          clubId,
          actorId,
          targetType: 'role',
          targetId: roleId,
          action: 'update',
          before: before as any,
          after: {
            name: u.name,
            description: u.description,
          } as any,
        },
      })

      return u
    })

    this.permissionsService.invalidateAll()
    return this.getRole(actorId, clubId, updated.id)
  }

  // ============================================
  // DELETE
  // ============================================

  async deleteRole(actorId: string, clubId: string, roleId: string) {
    await this.assertCanManageRoles(actorId, clubId)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, clubId },
      include: {
        _count: {
          select: { clubMembers: true, membershipRoles: true },
        },
      },
    })
    if (!role) throw new NotFoundException('Rol no encontrado')

    if (role.isSystem) {
      throw new BadRequestException(
        'No se puede eliminar un rol de sistema.',
      )
    }

    if (role._count.clubMembers > 0 || role._count.membershipRoles > 0) {
      throw new ConflictException(
        `No se puede eliminar el rol: todavía está asignado a ${
          role._count.clubMembers + role._count.membershipRoles
        } usuario(s). Reasígnalos primero.`,
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.permissionAuditLog.create({
        data: {
          clubId,
          actorId,
          targetType: 'role',
          targetId: roleId,
          action: 'delete',
          before: {
            id: role.id,
            scope: role.scope,
            name: role.name,
            description: role.description,
          } as any,
          after: null as any,
        },
      })

      await tx.role.delete({ where: { id: roleId } })
    })

    this.permissionsService.invalidateAll()
    return { deleted: true, id: roleId }
  }

  // ============================================
  // SET PERMISSIONS (bulk)
  // ============================================

  async setPermissions(
    actorId: string,
    clubId: string,
    roleId: string,
    dto: SetRolePermissionsDto,
  ) {
    await this.assertCanManageRoles(actorId, clubId)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, clubId },
      include: {
        permissions: {
          select: {
            id: true,
            resource: true,
            action: true,
            scope: true,
            granted: true,
          },
        },
      },
    })
    if (!role) throw new NotFoundException('Rol no encontrado')

    // Normalizar: quitar duplicados por (resource, action, scope).
    const keyOf = (p: RolePermissionInput) =>
      `${p.resource}|${p.action}|${p.scope ?? ''}`
    const seen = new Map<string, RolePermissionInput>()
    for (const p of dto.permissions) {
      const k = keyOf(p)
      if (seen.has(k)) {
        throw new BadRequestException(
          `Permiso duplicado en el payload: ${p.resource}:${p.action} (scope=${
            p.scope ?? 'null'
          })`,
        )
      }
      seen.set(k, p)
    }

    const before = role.permissions.map((p) => ({
      resource: p.resource,
      action: p.action,
      scope: p.scope,
      granted: p.granted,
    }))

    await this.prisma.$transaction(async (tx) => {
      // Borrar todo y recrear. Es la operación más simple y consistente.
      await tx.rolePermission.deleteMany({ where: { roleId } })

      if (dto.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissions.map((p) => ({
            roleId,
            resource: p.resource,
            action: p.action,
            scope: p.scope ?? null,
            granted: p.granted,
          })),
        })
      }

      await tx.permissionAuditLog.create({
        data: {
          clubId,
          actorId,
          targetType: 'role_permission',
          targetId: roleId,
          action: 'update',
          before: before as any,
          after: dto.permissions as any,
        },
      })
    })

    this.permissionsService.invalidateAll()
    return this.getRole(actorId, clubId, roleId)
  }

  // ============================================
  // PREVIEW DE IMPACTO
  // ============================================

  async previewImpact(
    actorId: string,
    clubId: string,
    roleId: string,
    dto: PreviewImpactDto,
  ) {
    await this.assertCanManageRoles(actorId, clubId)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, clubId },
      include: {
        permissions: {
          select: {
            resource: true,
            action: true,
            scope: true,
            granted: true,
          },
        },
      },
    })
    if (!role) throw new NotFoundException('Rol no encontrado')

    // Set before / after de claves "resource:action" (club-wide).
    // Ignoramos scope por equipo en el preview: es un cálculo simplificado
    // que compara el club-wide. En 8.5, si molesta, lo afinamos.
    const keyOf = (resource: string, action: string) => `${resource}:${action}`

    const before = new Set<string>()
    for (const p of role.permissions) {
      if (p.granted && p.scope === null) {
        before.add(keyOf(p.resource, p.action))
      }
    }

    const after = new Set<string>()
    for (const p of dto.permissions) {
      if (p.granted && (p.scope === null || p.scope === undefined)) {
        after.add(keyOf(p.resource, p.action))
      }
    }

    const added: string[] = []
    const removed: string[] = []
    for (const k of after) if (!before.has(k)) added.push(k)
    for (const k of before) if (!after.has(k)) removed.push(k)

    // Cuántos usuarios afecta (miembros con este rol asignado).
    let affectedClubMembers = 0
    let affectedTeamMembers = 0

    if (role.scope === 'CLUB') {
      affectedClubMembers = await this.prisma.clubMember.count({
        where: { clubId, roleId, isActive: true },
      })
    } else {
      affectedTeamMembers = await this.prisma.membershipRole.count({
        where: {
          roleId,
          membership: { status: 'ACTIVE', team: { clubId } },
        },
      })
    }

    return {
      roleId,
      roleName: role.name,
      roleScope: role.scope,
      affectedClubMembers,
      affectedTeamMembers,
      added,
      removed,
    }
  }
}