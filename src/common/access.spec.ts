import {
  canEditTeam,
  canViewTeam,
  getTeamForViewer,
  getTeamsForViewer,
  resolveViewerStatsRole,
} from './access'

type MockPrisma = {
  user: { findUnique: jest.Mock }
  team: { findUnique: jest.Mock; findMany: jest.Mock }
  teamMembership: { findFirst: jest.Mock; findMany: jest.Mock }
  clubMember: { findFirst: jest.Mock }
  tutorRelationship: { findFirst: jest.Mock }
}

function makePrisma(): MockPrisma {
  return {
    user: { findUnique: jest.fn() },
    team: { findUnique: jest.fn(), findMany: jest.fn() },
    teamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
    clubMember: { findFirst: jest.fn() },
    tutorRelationship: { findFirst: jest.fn() },
  }
}

function asAny(p: MockPrisma): any {
  return p as any
}

describe('access', () => {
  let prisma: MockPrisma

  beforeEach(() => {
    prisma = makePrisma()
    // Defaults seguros
    prisma.user.findUnique.mockResolvedValue({
      role: 'USER',
      deletedAt: null,
    })
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      clubId: 'c1',
      sport: 'BASKETBALL',
      club: { id: 'c1', name: 'Club' },
    })
    prisma.teamMembership.findFirst.mockResolvedValue(null)
    prisma.teamMembership.findMany.mockResolvedValue([])
    prisma.clubMember.findFirst.mockResolvedValue(null)
    prisma.tutorRelationship.findFirst.mockResolvedValue(null)
  })

  // ─────────────────────────────────────────────
  // canViewTeam
  // ─────────────────────────────────────────────

  describe('canViewTeam', () => {
    it('true si es super admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'SUPER_ADMIN',
        deletedAt: null,
      })
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si es admin club', async () => {
      prisma.clubMember.findFirst.mockResolvedValue({ role: 'ADMIN_CLUB' })
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si tiene membership activo', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'PLAYER' }],
      })
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si es tutor activo de un miembro', async () => {
      prisma.tutorRelationship.findFirst.mockResolvedValue({ id: 'rel-1' })
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('false si no hay nada', async () => {
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(false)
    })

    it('false si el team no existe', async () => {
      prisma.team.findUnique.mockResolvedValue(null)
      expect(await canViewTeam(asAny(prisma), 'u1', 't1')).toBe(false)
    })
  })

  // ─────────────────────────────────────────────
  // canEditTeam
  // ─────────────────────────────────────────────

  describe('canEditTeam', () => {
    it('true si es super admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'SUPER_ADMIN',
        deletedAt: null,
      })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si es admin club', async () => {
      prisma.clubMember.findFirst.mockResolvedValue({ role: 'ADMIN_CLUB' })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si es COACH', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }],
      })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('true si es ADMIN_TEAM', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'ADMIN_TEAM' }],
      })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })

    it('false si es PLAYER', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'PLAYER' }],
      })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(false)
    })

        it('true si es ASSISTANT', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'ASSISTANT' }],
      })
      expect(await canEditTeam(asAny(prisma), 'u1', 't1')).toBe(true)
    })
  })

  // ─────────────────────────────────────────────
  // getTeamForViewer
  // ─────────────────────────────────────────────

  describe('getTeamForViewer', () => {
    it('lanza 404 si el team no existe', async () => {
      prisma.team.findUnique.mockResolvedValue(null)
      await expect(
        getTeamForViewer(asAny(prisma), 'u1', 't404'),
      ).rejects.toThrow('Equipo no encontrado')
    })

    it('lanza 403 si no tiene acceso', async () => {
      // team existe, pero sin roles ni parentesco
      await expect(
        getTeamForViewer(asAny(prisma), 'u1', 't1'),
      ).rejects.toThrow('No tienes acceso a este equipo')
    })

    it('devuelve el team con club si tiene acceso', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }],
      })
      const team = await getTeamForViewer(asAny(prisma), 'u1', 't1')
      expect(team.id).toBe('t1')
      expect(team.club).toBeDefined()
    })
  })

  // ─────────────────────────────────────────────
  // getTeamsForViewer
  // ─────────────────────────────────────────────

  describe('getTeamsForViewer', () => {
    it('lanza 403 si no se indica ningún team', async () => {
      await expect(
        getTeamsForViewer(asAny(prisma), 'u1', []),
      ).rejects.toThrow('No se han indicado equipos')
    })

    it('lanza 404 si algún team no existe', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 't1', clubId: 'c1', sport: 'BASKETBALL', club: {} },
      ])
      await expect(
        getTeamsForViewer(asAny(prisma), 'u1', ['t1', 't2']),
      ).rejects.toThrow('Alguno de los equipos no existe')
    })

    it('lanza 403 si algún team no es accesible', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 't1', clubId: 'c1', sport: 'BASKETBALL', club: {} },
        { id: 't2', clubId: 'c1', sport: 'BASKETBALL', club: {} },
      ])
      // teamMembership.findFirst se llama por cada team
      prisma.teamMembership.findFirst
        .mockResolvedValueOnce({ roles: [{ role: 'COACH' }] }) // t1 OK
        .mockResolvedValueOnce(null) // t2 sin acceso

      // Para t2, canViewTeam comprueba: superAdmin no, clubAdmin no,
      // teamRoles vacíos, parent no → false
      await expect(
        getTeamsForViewer(asAny(prisma), 'u1', ['t1', 't2']),
      ).rejects.toThrow('No tienes acceso')
    })

    it('lanza 403 si los teams son de deportes distintos', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 't1', clubId: 'c1', sport: 'BASKETBALL', club: {} },
        { id: 't2', clubId: 'c1', sport: 'PADEL', club: {} },
      ])
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }],
      })
      await expect(
        getTeamsForViewer(asAny(prisma), 'u1', ['t1', 't2']),
      ).rejects.toThrow('Solo se pueden combinar equipos del mismo deporte')
    })

    it('devuelve los teams en el orden solicitado', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 't2', clubId: 'c1', sport: 'BASKETBALL', club: {} },
        { id: 't1', clubId: 'c1', sport: 'BASKETBALL', club: {} },
      ])
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }],
      })
      const result = await getTeamsForViewer(asAny(prisma), 'u1', ['t1', 't2'])
      expect(result.map((t: any) => t.id)).toEqual(['t1', 't2'])
    })
  })

  // ─────────────────────────────────────────────
  // resolveViewerStatsRole
  // ─────────────────────────────────────────────

  describe('resolveViewerStatsRole', () => {
    it('ADMIN_TEAM si es super admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'SUPER_ADMIN',
        deletedAt: null,
      })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('ADMIN_TEAM')
    })

    it('ADMIN_TEAM si es admin club', async () => {
      prisma.clubMember.findFirst.mockResolvedValue({ role: 'ADMIN_CLUB' })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('ADMIN_TEAM')
    })

    it('COACH si es coach', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }],
      })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('COACH')
    })

    it('ADMIN_TEAM gana a COACH si tiene varios roles', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'COACH' }, { role: 'ADMIN_TEAM' }],
      })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('ADMIN_TEAM')
    })

    it('PLAYER si es jugador', async () => {
      prisma.teamMembership.findFirst.mockResolvedValue({
        roles: [{ role: 'PLAYER' }],
      })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('PLAYER')
    })

    it('VISITOR si es tutor', async () => {
      prisma.tutorRelationship.findFirst.mockResolvedValue({ id: 'rel' })
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('VISITOR')
    })

    it('VISITOR por defecto', async () => {
      expect(
        await resolveViewerStatsRole(asAny(prisma), 'u1', 't1'),
      ).toBe('VISITOR')
    })
  })
})
import {
  canViewPlayerProfile,
  canEditPlayerProfile,
  assertCanViewPlayerProfile,
} from './access'
import { ForbiddenException, NotFoundException } from '@nestjs/common'

// Helper para crear un prisma mock con todos los métodos que necesitamos.
// Cada test ajusta solo lo que le interesa.
function makePrismaMock(overrides: Record<string, any> = {}) {
  const base: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    tutorRelationship: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    clubMember: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    teamMembership: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }
  return { ...base, ...overrides }
}

describe('canViewPlayerProfile', () => {
  it('el propio usuario puede ver su perfil', async () => {
    const prisma = makePrismaMock()
    expect(await canViewPlayerProfile(prisma, 'u1', 'u1')).toBe(true)
  })

  it('SUPER_ADMIN siempre puede ver', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: 'SUPER_ADMIN', deletedAt: null }) // isSuperAdmin
          .mockResolvedValueOnce({ id: 'u2', deletedAt: null }), // target
      },
    })
    expect(await canViewPlayerProfile(prisma, 'admin', 'u2')).toBe(true)
  })

  it('devuelve false si el target no existe', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // isSuperAdmin → null
          .mockResolvedValueOnce(null), // target → null
      },
    })
    expect(await canViewPlayerProfile(prisma, 'u1', 'target')).toBe(false)
  })

  it('devuelve false si el target está soft-deleted', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: new Date() }),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'u1', 'target')).toBe(false)
  })

  it('devuelve false si no hay club ni equipo', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: null }),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'u1', 'target')).toBe(false)
  })

  it('tutor ACTIVE puede ver', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: null }),
      },
      tutorRelationship: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rel' }),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'tutor', 'target')).toBe(true)
  })

  it('ADMIN_CLUB del club del target puede ver', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: null }),
      },
      clubMember: {
        findMany: jest.fn().mockResolvedValue([{ clubId: 'club1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'cm' }),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'adminclub', 'target')).toBe(
      true,
    )
  })

  it('COACH de un equipo del target puede ver', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: null }),
      },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: 'team1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'tm' }),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'coach', 'target')).toBe(true)
  })

  it('un usuario random sin relación no puede ver', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'target', deletedAt: null }),
      },
      clubMember: {
        findMany: jest.fn().mockResolvedValue([{ clubId: 'club1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: 'team1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    })
    expect(await canViewPlayerProfile(prisma, 'random', 'target')).toBe(false)
  })
})

describe('canEditPlayerProfile', () => {
  it('SUPER_ADMIN siempre puede editar', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: 'SUPER_ADMIN', deletedAt: null }),
      },
    })
    expect(await canEditPlayerProfile(prisma, 'admin', 'target')).toBe(true)
  })

  it('el propio usuario puede editar', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'target',
            isGhost: false,
            deletedAt: null,
          }),
      },
    })
    expect(await canEditPlayerProfile(prisma, 'target', 'target')).toBe(true)
  })

  it('otro usuario NO puede editar si el target no es ghost', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'target',
            isGhost: false,
            deletedAt: null,
          }),
      },
    })
    expect(await canEditPlayerProfile(prisma, 'other', 'target')).toBe(false)
  })

  it('COACH de un equipo del target ghost puede editar', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'target',
            isGhost: true,
            deletedAt: null,
          }),
      },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: 'team1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'tm' }),
      },
    })
    expect(await canEditPlayerProfile(prisma, 'coach', 'target')).toBe(true)
  })

  it('un usuario random no puede editar a un ghost', async () => {
    const prisma = makePrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'target',
            isGhost: true,
            deletedAt: null,
          }),
      },
      clubMember: {
        findMany: jest.fn().mockResolvedValue([{ clubId: 'club1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([{ teamId: 'team1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    })
    expect(await canEditPlayerProfile(prisma, 'random', 'target')).toBe(false)
  })
})

describe('assertCanViewPlayerProfile', () => {
  it('lanza 404 si el target no existe', async () => {
    const prisma = makePrismaMock()
    await expect(
      assertCanViewPlayerProfile(prisma, 'u1', 'ghost'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lanza 403 si no tiene acceso', async () => {
  const prisma = makePrismaMock({
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'target', deletedAt: null }) // target existe
        .mockResolvedValueOnce(null), // isSuperAdmin → no es super admin
    },
  })
  await expect(
    assertCanViewPlayerProfile(prisma, 'u1', 'target'),
  ).rejects.toBeInstanceOf(ForbiddenException)
})
})