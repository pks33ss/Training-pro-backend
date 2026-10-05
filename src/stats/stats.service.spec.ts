import { NotFoundException } from '@nestjs/common'
import { TeamStatsService } from './stats.service'
import { canViewTeam, getTeamsForViewer } from '../common/access'

jest.mock('../common/access', () => ({
  canViewTeam: jest.fn(),
  getTeamsForViewer: jest.fn(),
  // Añade aquí los demás helpers de access.ts que use stats.service.ts,
  // aunque no los uses en estos tests, para que el mock sea completo.
  resolveViewerStatsRole: jest.fn(),
  isSuperAdmin: jest.fn(),
  isClubAdmin: jest.fn(),
}))

const canViewTeamMock = canViewTeam as jest.Mock
const getTeamsForViewerMock = getTeamsForViewer as jest.Mock

describe('TeamStatsService.getPlayerTeamsForTeamContext', () => {
  let service: TeamStatsService
  let prismaMock: any
  let basketballStatsMock: any

  const mainTeam = {
    id: 'team-main',
    name: 'Cadete ROJO',
    sport: 'BASKETBALL',
    clubId: 'club-1',
    club: { id: 'club-1', name: 'CD Maristas' },
  }

  const playerUserId = 'player-1'

  beforeEach(() => {
    canViewTeamMock.mockReset()
    getTeamsForViewerMock.mockReset()

    prismaMock = {
      user: { findUnique: jest.fn() },
      team: { findMany: jest.fn() },
    }
    basketballStatsMock = {}

    getTeamsForViewerMock.mockResolvedValue([mainTeam])

    service = new TeamStatsService(prismaMock, basketballStatsMock)
  })

  it('lanza 404 si el jugador no existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(
      service.getPlayerTeamsForTeamContext(
        'viewer-1',
        'team-main',
        playerUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lanza 404 si el jugador está soft-deleted', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: playerUserId,
      deletedAt: new Date(),
    })

    await expect(
      service.getPlayerTeamsForTeamContext(
        'viewer-1',
        'team-main',
        playerUserId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('devuelve lista vacía si no hay equipos con membresía del jugador', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: playerUserId,
      deletedAt: null,
    })
    prismaMock.team.findMany.mockResolvedValue([])

    const result = await service.getPlayerTeamsForTeamContext(
      'viewer-1',
      'team-main',
      playerUserId,
    )

    expect(result).toEqual([])
  })

  it('filtra la query por memberships del jugador y por club+deporte', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: playerUserId,
      deletedAt: null,
    })
    prismaMock.team.findMany.mockResolvedValue([])

    await service.getPlayerTeamsForTeamContext(
      'viewer-1',
      'team-main',
      playerUserId,
    )

    const call = prismaMock.team.findMany.mock.calls[0][0]
    expect(call.where.memberships).toEqual({
      some: { userId: playerUserId },
    })
    expect(call.where.clubId).toBe(mainTeam.clubId)
    expect(call.where.sport).toBe(mainTeam.sport)
  })

  it('filtra equipos por canViewTeam (P5-B)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: playerUserId,
      deletedAt: null,
    })

    prismaMock.team.findMany.mockResolvedValue([
      {
        id: 'team-A',
        name: 'Cadete AZUL',
        sport: 'BASKETBALL',
        category: 'Cadete',
        club: { id: 'club-1', name: 'CD Maristas' },
        memberships: [
          {
            status: 'ACTIVE',
            jerseyNumber: 7,
            position: 'Base',
            roles: [{ role: 'PLAYER' }],
          },
        ],
      },
      {
        id: 'team-B',
        name: 'Cadete VERDE',
        sport: 'BASKETBALL',
        category: 'Cadete',
        club: { id: 'club-1', name: 'CD Maristas' },
        memberships: [],
      },
    ])

    canViewTeamMock
      .mockResolvedValueOnce(true) // team-A sí
      .mockResolvedValueOnce(false) // team-B no

    const result = await service.getPlayerTeamsForTeamContext(
      'viewer-1',
      'team-main',
      playerUserId,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('team-A')
    expect(result[0].role).toBe('PLAYER')
    expect(result[0].roles).toEqual(['PLAYER'])
    expect(result[0].status).toBe('ACTIVE')
    expect(result[0].jerseyNumber).toBe(7)
    expect(result[0].position).toBe('Base')
    expect(result[0].isFormer).toBe(false)
  })

  it('marca isFormer=true si no hay membership o no está ACTIVE', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: playerUserId,
      deletedAt: null,
    })

    prismaMock.team.findMany.mockResolvedValue([
      {
        id: 'team-A',
        name: 'Cadete AZUL',
        sport: 'BASKETBALL',
        category: null,
        club: { id: 'club-1', name: 'CD Maristas' },
        memberships: [
          {
            status: 'LEFT',
            jerseyNumber: null,
            position: null,
            roles: [{ role: 'PLAYER' }],
          },
        ],
      },
      {
        id: 'team-B',
        name: 'Cadete VERDE',
        sport: 'BASKETBALL',
        category: null,
        club: { id: 'club-1', name: 'CD Maristas' },
        memberships: [],
      },
    ])

    canViewTeamMock.mockResolvedValue(true)

    const result = await service.getPlayerTeamsForTeamContext(
      'viewer-1',
      'team-main',
      playerUserId,
    )

    expect(result).toHaveLength(2)
    expect(result[0].isFormer).toBe(true)
    expect(result[0].status).toBe('LEFT')
    expect(result[1].isFormer).toBe(true)
    expect(result[1].status).toBeNull()
    expect(result[1].roles).toEqual([])
  })
})