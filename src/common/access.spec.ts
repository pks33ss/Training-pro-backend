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