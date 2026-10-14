// backend/prisma/seed-joinsport-demo.ts
// Lote 8.5 — Seed de un club ficticio "JoinSport" para QA.
//
// Crea:
//   - 1 club: JoinSport
//   - 5 equipos: JoinBasketball, JoinPadel, JoinSoccer, JoinTenis, JoinVolleyBall
//   - 60 usuarios con roles variados
//   - 1 rol custom "Tesorero Junior" con solo payment:view
//   - 1 usuario MEMBER con ese rol custom
//
// Idempotente: se puede ejecutar varias veces sin duplicar.
// Ejecutar con: npx tsx prisma/seed-joinsport-demo.ts

import * as bcrypt from 'bcrypt'
import { prisma } from './_client'
import { seedSystemRolesForClub } from '../src/permissions/seed-roles'

const PASSWORD_PLAIN = 'JoinSport2026!'
const EMAIL_DOMAIN = 'joinsportapp.com'
const CLUB_NAME = 'JoinSport'

// ─────────────────────────────────────────────
// Definición de usuarios
// ─────────────────────────────────────────────

interface UserDef {
  firstName: string
  lastName: string
  email: string // sin dominio, se añade @joinsportapp.com
  /** Rol de club (nombre del rol de sistema CLUB) */
  clubRole: string
  /** Roles por equipo: { nombreEquipo: nombreRolTeam } */
  teamRoles?: Record<string, string>
  /** Si true, este usuario usa un rol custom (ver CUSTOM_ROLE) */
  usesCustomRole?: boolean
}

// ─────────────────────────────────────────────
// Plantilla de usuarios
// ─────────────────────────────────────────────

const USERS: UserDef[] = [
  // ───── NÚCLEO ADMINISTRATIVO (6) ─────
  {
    firstName: 'Álvaro',
    lastName: 'Ruiz Mendoza',
    email: 'alvaro.ruiz',
    clubRole: 'ADMIN_CLUB',
  },
  {
    firstName: 'Beatriz',
    lastName: 'Soler Navarro',
    email: 'beatriz.soler',
    clubRole: 'DIRECTOR_DEPORTIVO',
  },
  {
    firstName: 'Carlos',
    lastName: 'Vidal Ortega',
    email: 'carlos.vidal',
    clubRole: 'COORDINADOR',
  },
  {
    firstName: 'Diana',
    lastName: 'Ferrer Lozano',
    email: 'diana.ferrer',
    clubRole: 'SECRETARIO',
  },
  {
    firstName: 'Eduardo',
    lastName: 'Blanco Iglesias',
    email: 'eduardo.blanco',
    clubRole: 'TESORERO',
  },
  {
    firstName: 'Fátima',
    lastName: 'Guerrero Sanz',
    email: 'fatima.guerrero',
    clubRole: 'OJEADOR',
  },

  // ───── CUERPO TÉCNICO TRANSVERSAL (3) ─────
  {
    firstName: 'Gonzalo',
    lastName: 'Prieto Cano',
    email: 'gonzalo.prieto',
    clubRole: 'COACH',
    teamRoles: {
      JoinBasketball: 'COACH',
      JoinSoccer: 'COACH',
    },
  },
  {
    firstName: 'Helena',
    lastName: 'Ortiz Rey',
    email: 'helena.ortiz',
    clubRole: 'ASSISTANT',
    teamRoles: {
      JoinPadel: 'ASSISTANT',
    },
  },
  {
    firstName: 'Ignacio',
    lastName: 'Márquez León',
    email: 'ignacio.marquez',
    clubRole: 'ASSISTANT',
    teamRoles: {
      JoinTenis: 'DELEGADO',
      JoinVolleyBall: 'DELEGADO',
    },
  },

  // ───── JoinBasketball (8) ─────
  {
    firstName: 'Javier',
    lastName: 'Núñez Cabrera',
    email: 'javier.nunez',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'ADMIN_TEAM' },
  },
  {
    firstName: 'Lucía',
    lastName: 'Peña Rivas',
    email: 'lucia.pena',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'COACH' },
  },
  {
    firstName: 'Mateo',
    lastName: 'Quintana Gil',
    email: 'mateo.quintana',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'ASSISTANT' },
  },
  {
    firstName: 'Nuria',
    lastName: 'Ramírez Soto',
    email: 'nuria.ramirez',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'DELEGADO' },
  },
  {
    firstName: 'Óscar',
    lastName: 'Serrano Vidal',
    email: 'oscar.serrano',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'FISIO' },
  },
  {
    firstName: 'Paula',
    lastName: 'Torres Aguilar',
    email: 'paula.torres',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'PLAYER' },
  },
  {
    firstName: 'Quique',
    lastName: 'Ureña Bravo',
    email: 'quique.urena',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'PLAYER' },
  },
  {
    firstName: 'Rocío',
    lastName: 'Valero Cano',
    email: 'rocio.valero',
    clubRole: 'MEMBER',
    teamRoles: { JoinBasketball: 'ENTRENADOR_VISITANTE' },
  },

  // ───── JoinPadel (8) ─────
  {
    firstName: 'Sergio',
    lastName: 'Aguilar Ríos',
    email: 'sergio.aguilar',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'ADMIN_TEAM' },
  },
  {
    firstName: 'Teresa',
    lastName: 'Bermúdez Pardo',
    email: 'teresa.bermudez',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'COACH' },
  },
  {
    firstName: 'Unai',
    lastName: 'Casado Vives',
    email: 'unai.casado',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'ASSISTANT' },
  },
  {
    firstName: 'Valeria',
    lastName: 'Delgado Mora',
    email: 'valeria.delgado',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'DELEGADO' },
  },
  {
    firstName: 'Xavier',
    lastName: 'Enríquez Roldán',
    email: 'xavier.enriquez',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'FISIO' },
  },
  {
    firstName: 'Yolanda',
    lastName: 'Fuentes Lara',
    email: 'yolanda.fuentes',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'PLAYER' },
  },
  {
    firstName: 'Zacarías',
    lastName: 'Gómez Peña',
    email: 'zacarias.gomez',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'PLAYER' },
  },
  {
    firstName: 'Aitana',
    lastName: 'Herrera Blanco',
    email: 'aitana.herrera',
    clubRole: 'MEMBER',
    teamRoles: { JoinPadel: 'ENTRENADOR_VISITANTE' },
  },

  // ───── JoinSoccer (8) ─────
  {
    firstName: 'Bruno',
    lastName: 'Iglesias Cuenca',
    email: 'bruno.iglesias',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'ADMIN_TEAM' },
  },
  {
    firstName: 'Clara',
    lastName: 'Jiménez Rubio',
    email: 'clara.jimenez',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'COACH' },
  },
  {
    firstName: 'Diego',
    lastName: 'Lozano Prieto',
    email: 'diego.lozano',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'ASSISTANT' },
  },
  {
    firstName: 'Elena',
    lastName: 'Martín Sáez',
    email: 'elena.martin',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'DELEGADO' },
  },
  {
    firstName: 'Fernando',
    lastName: 'Navarro Peñas',
    email: 'fernando.navarro',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'FISIO' },
  },
  {
    firstName: 'Gabriela',
    lastName: 'Ochoa Sierra',
    email: 'gabriela.ochoa',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'PLAYER' },
  },
  {
    firstName: 'Hugo',
    lastName: 'Pérez López',
    email: 'hugo.perez',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'PLAYER' },
  },
  {
    firstName: 'Irene',
    lastName: 'Quintero Sala',
    email: 'irene.quintero',
    clubRole: 'MEMBER',
    teamRoles: { JoinSoccer: 'ENTRENADOR_VISITANTE' },
  },

  // ───── JoinTenis (8) ─────
  {
    firstName: 'Jorge',
    lastName: 'Ramos Toledo',
    email: 'jorge.ramos',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'ADMIN_TEAM' },
  },
  {
    firstName: 'Karla',
    lastName: 'Sánchez Vega',
    email: 'karla.sanchez',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'COACH' },
  },
  {
    firstName: 'Luis',
    lastName: 'Torres Ávila',
    email: 'luis.torres',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'ASSISTANT' },
  },
  {
    firstName: 'Marta',
    lastName: 'Urbina Cuesta',
    email: 'marta.urbina',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'DELEGADO' },
  },
  {
    firstName: 'Nicolás',
    lastName: 'Vargas Núñez',
    email: 'nicolas.vargas',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'FISIO' },
  },
  {
    firstName: 'Olga',
    lastName: 'Wenceslao Díaz',
    email: 'olga.wenceslao',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'PLAYER' },
  },
  {
    firstName: 'Pablo',
    lastName: 'Xuárez Mena',
    email: 'pablo.xuarez',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'PLAYER' },
  },
  {
    firstName: 'Raquel',
    lastName: 'Yuste Cordero',
    email: 'raquel.yuste',
    clubRole: 'MEMBER',
    teamRoles: { JoinTenis: 'ENTRENADOR_VISITANTE' },
  },

  // ───── JoinVolleyBall (8) ─────
  {
    firstName: 'Samuel',
    lastName: 'Zamora Pascual',
    email: 'samuel.zamora',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'ADMIN_TEAM' },
  },
  {
    firstName: 'Tania',
    lastName: 'Alonso Baeza',
    email: 'tania.alonso',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'COACH' },
  },
  {
    firstName: 'Uriel',
    lastName: 'Bautista Cañas',
    email: 'uriel.bautista',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'ASSISTANT' },
  },
  {
    firstName: 'Verónica',
    lastName: 'Cordero Ferre',
    email: 'veronica.cordero',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'DELEGADO' },
  },
  {
    firstName: 'Walter',
    lastName: 'Domínguez Vega',
    email: 'walter.dominguez',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'FISIO' },
  },
  {
    firstName: 'Ximena',
    lastName: 'Estévez Parra',
    email: 'ximena.estevez',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'PLAYER' },
  },
  {
    firstName: 'Yago',
    lastName: 'Fuentes Ríos',
    email: 'yago.fuentes',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'PLAYER' },
  },
  {
    firstName: 'Zoe',
    lastName: 'Gallardo Sanz',
    email: 'zoe.gallardo',
    clubRole: 'MEMBER',
    teamRoles: { JoinVolleyBall: 'ENTRENADOR_VISITANTE' },
  },

  // ───── JUGADORES MULTI-EQUIPO (5) ─────
  {
    firstName: 'Adrián',
    lastName: 'Hernández Cruz',
    email: 'adrian.hernandez',
    clubRole: 'MEMBER',
    teamRoles: {
      JoinBasketball: 'PLAYER',
      JoinSoccer: 'PLAYER',
    },
  },
  {
    firstName: 'Blanca',
    lastName: 'Ibáñez Rojo',
    email: 'blanca.ibanez',
    clubRole: 'MEMBER',
    teamRoles: {
      JoinPadel: 'PLAYER',
      JoinTenis: 'PLAYER',
    },
  },
  {
    firstName: 'Cristian',
    lastName: 'Jurado Marín',
    email: 'cristian.jurado',
    clubRole: 'MEMBER',
    teamRoles: {
      JoinBasketball: 'PLAYER',
      JoinVolleyBall: 'PLAYER',
    },
  },
  {
    firstName: 'Daniela',
    lastName: 'Klein Vidal',
    email: 'daniela.klein',
    clubRole: 'MEMBER',
    teamRoles: {
      JoinSoccer: 'PLAYER',
      JoinTenis: 'PLAYER',
    },
  },
  {
    firstName: 'Emilio',
    lastName: 'Lara Peláez',
    email: 'emilio.lara',
    clubRole: 'MEMBER',
    teamRoles: {
      JoinPadel: 'PLAYER',
      JoinVolleyBall: 'PLAYER',
    },
  },

  // ───── MIEMBROS SIN EQUIPO (6) ─────
  {
    firstName: 'Fabiola',
    lastName: 'Mendoza Cuesta',
    email: 'fabiola.mendoza',
    clubRole: 'MEMBER',
  },
  {
    firstName: 'Gustavo',
    lastName: 'Nieto Sanz',
    email: 'gustavo.nieto',
    clubRole: 'MEMBER',
  },
  {
    firstName: 'Hilda',
    lastName: 'Otero Bravo',
    email: 'hilda.otero',
    clubRole: 'MEMBER',
  },
  {
    firstName: 'Iván',
    lastName: 'Pardo Cuenca',
    email: 'ivan.pardo',
    clubRole: 'MEMBER',
  },
  {
    firstName: 'Julia',
    lastName: 'Quiroga Mena',
    email: 'julia.quiroga',
    clubRole: 'MEMBER',
  },
  {
    firstName: 'Kevin',
    lastName: 'Ramos Silva',
    email: 'kevin.ramos',
    clubRole: 'MEMBER',
  },
]

// ─────────────────────────────────────────────
// Equipos
// ─────────────────────────────────────────────

interface TeamDef {
  name: string
  sport: 'BASKETBALL' | 'PADEL' | 'FOOTBALL' | 'TENNIS' | 'VOLLEYBALL'
  category: string
  season: string
}

const TEAMS: TeamDef[] = [
  { name: 'JoinBasketball', sport: 'BASKETBALL', category: 'Senior', season: '2025-2026' },
  { name: 'JoinPadel', sport: 'PADEL', category: 'Senior', season: '2025-2026' },
  { name: 'JoinSoccer', sport: 'FOOTBALL', category: 'Senior', season: '2025-2026' },
  { name: 'JoinTenis', sport: 'TENNIS', category: 'Senior', season: '2025-2026' },
  { name: 'JoinVolleyBall', sport: 'VOLLEYBALL', category: 'Senior', season: '2025-2026' },
]

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Mapeo rol nuevo → rol legacy (enum ClubRole)
// ─────────────────────────────────────────────
// El enum legacy solo tiene 4 valores. Hasta 8.7 seguimos escribiendo en él
// con un valor "razonable" para no romper access.ts. El rol real (roleId)
// es el que manda.

type LegacyClubRole = 'ADMIN_CLUB' | 'COACH' | 'ASSISTANT' | 'MEMBER'

const LEGACY_CLUB_ROLE_MAP: Record<string, LegacyClubRole> = {
  ADMIN_CLUB: 'ADMIN_CLUB',
  COACH: 'COACH',
  ASSISTANT: 'ASSISTANT',
  MEMBER: 'MEMBER',
  DIRECTOR_DEPORTIVO: 'COACH',
  COORDINADOR: 'COACH',
  SECRETARIO: 'MEMBER',
  TESORERO: 'MEMBER',
  OJEADOR: 'MEMBER',
}

function legacyClubRole(name: string): LegacyClubRole {
  return LEGACY_CLUB_ROLE_MAP[name] ?? 'MEMBER'
}

// ─────────────────────────────────────────────
// Mapeo rol de equipo nuevo → rol legacy (enum MembershipRoleType)
// ─────────────────────────────────────────────

type LegacyTeamRole =
  | 'PLAYER'
  | 'COACH'
  | 'ASSISTANT'
  | 'ADMIN_TEAM'
  | 'VISITOR'

const LEGACY_TEAM_ROLE_MAP: Record<string, LegacyTeamRole> = {
  PLAYER: 'PLAYER',
  COACH: 'COACH',
  ASSISTANT: 'ASSISTANT',
  ADMIN_TEAM: 'ADMIN_TEAM',
  DELEGADO: 'PLAYER',
  FISIO: 'ASSISTANT',
  ENTRENADOR_VISITANTE: 'VISITOR',
}

function legacyTeamRole(name: string): LegacyTeamRole {
  return LEGACY_TEAM_ROLE_MAP[name] ?? 'PLAYER'
}


async function main() {
  console.log('🚀 Seed JoinSport (demo)')
  console.log('')

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 10)

  // ───── 1) Club ─────
  let club = await prisma.club.findFirst({
    where: { name: CLUB_NAME },
  })
  if (!club) {
    club = await prisma.club.create({
      data: {
        name: CLUB_NAME,
        description: 'Club ficticio para QA de permisos',
        primaryColor: '#00E676',
        secondaryColor: '#0A0A0A',
      },
    })
    console.log(`✅ Club "${CLUB_NAME}" creado: ${club.id}`)
  } else {
    console.log(`ℹ️  Club "${CLUB_NAME}" ya existe: ${club.id}`)
  }

  // ───── 2) Roles de sistema ─────
  await seedSystemRolesForClub(prisma as any, club.id)
  console.log('✅ Roles de sistema asegurados')
  console.log('')

  // ───── 3) Equipos ─────
  const teamMap = new Map<string, { id: string; name: string }>()
  for (const t of TEAMS) {
    let team = await prisma.team.findFirst({
      where: { clubId: club.id, name: t.name },
    })
    if (!team) {
      team = await prisma.team.create({
        data: {
          name: t.name,
          sport: t.sport,
          category: t.category,
          season: t.season,
          clubId: club.id,
        },
      })
      console.log(`  ✅ Equipo "${t.name}" creado`)
    } else {
      console.log(`  ℹ️  Equipo "${t.name}" ya existe`)
    }
    teamMap.set(t.name, { id: team.id, name: team.name })
  }
  console.log('')

  // ───── 4) Usuarios + ClubMember + TeamMembership ─────
  let createdUsers = 0
  let updatedUsers = 0

  for (const u of USERS) {
    const email = `${u.email}@${EMAIL_DOMAIN}`

    // 4a) User
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: u.firstName,
          lastName: u.lastName,
          role: 'USER',
          isGhost: false,
          username: `@${u.email}`, // username = @local-part
        },
      })
      createdUsers++
    } else {
      updatedUsers++
    }

    // 4b) ClubMember
    const clubRole = await prisma.role.findUnique({
      where: {
        clubId_scope_name: { clubId: club.id, scope: 'CLUB', name: u.clubRole },
      },
    })
    if (!clubRole) {
      console.warn(
        `⚠️  Rol de club "${u.clubRole}" no encontrado para ${email}. Se omite.`,
      )
      continue
    }

    const existingCM = await prisma.clubMember.findUnique({
      where: { userId_clubId: { userId: user.id, clubId: club.id } },
    })
    if (!existingCM) {
      await prisma.clubMember.create({
        data: {
          userId: user.id,
          clubId: club.id,
          roleId: clubRole.id,
                    role: legacyClubRole(u.clubRole), // legacy
          isActive: true,
        },
      })
    }

    // 4c) TeamMemberships
    if (u.teamRoles) {
      for (const [teamName, teamRoleName] of Object.entries(u.teamRoles)) {
        const teamRef = teamMap.get(teamName)
        if (!teamRef) {
          console.warn(`⚠️  Equipo "${teamName}" no encontrado. Se omite.`)
          continue
        }

        const teamRole = await prisma.role.findUnique({
          where: {
            clubId_scope_name: {
              clubId: club.id,
              scope: 'TEAM',
              name: teamRoleName,
            },
          },
        })
        if (!teamRole) {
          console.warn(
            `⚠️  Rol de equipo "${teamRoleName}" no encontrado. Se omite.`,
          )
          continue
        }

        const existingTM = await prisma.teamMembership.findUnique({
          where: {
            userId_teamId: { userId: user.id, teamId: teamRef.id },
          },
        })

        if (!existingTM) {
                    await prisma.teamMembership.create({
            data: {
              userId: user.id,
              teamId: teamRef.id,
              status: 'ACTIVE',
              roles: {
                create: [
                  {
                    role: legacyTeamRole(teamRoleName), // legacy
                    roleId: teamRole.id,
                  },
                ],
              },
            },
          })
        } else {
          // Aseguramos el rol específico
          const existingRole = await prisma.membershipRole.findFirst({
            where: { membershipId: existingTM.id, roleId: teamRole.id },
          })
          if (!existingRole) {
                        await prisma.membershipRole.create({
              data: {
                membershipId: existingTM.id,
                roleId: teamRole.id,
                role: legacyTeamRole(teamRoleName), // legacy
              },
            })
          }
        }
      }
    }
  }

  console.log(`✅ Usuarios procesados: ${createdUsers} creados, ${updatedUsers} ya existían`)
  console.log('')

  // ───── 5) Rol custom "Tesorero Junior" ─────
  console.log('🔧 Rol custom "Tesorero Junior" (solo payment:view)')

  const tesoreroJunior = await prisma.role.upsert({
    where: {
      clubId_scope_name: {
        clubId: club.id,
        scope: 'CLUB',
        name: 'Tesorero Junior',
      },
    },
    update: {},
    create: {
      clubId: club.id,
      scope: 'CLUB',
      name: 'Tesorero Junior',
      description: 'Solo puede ver pagos, no editarlos',
      isSystem: false,
      isDefault: false,
    },
  })

  // Permiso único: payment:view
  const existingTP = await prisma.rolePermission.findFirst({
    where: {
      roleId: tesoreroJunior.id,
      resource: 'payment',
      action: 'view',
      scope: null,
    },
  })
  if (!existingTP) {
    await prisma.rolePermission.create({
      data: {
        roleId: tesoreroJunior.id,
        resource: 'payment',
        action: 'view',
        scope: null,
        granted: true,
      },
    })
    console.log('  ✅ Permiso payment:view asignado')
  } else {
    console.log('  ℹ️  Permiso ya existía')
  }

  // ───── 6) Asignar el rol custom a un usuario ─────
  const customUserEmail = `fabiola.mendoza@${EMAIL_DOMAIN}`
  const customUser = await prisma.user.findUnique({
    where: { email: customUserEmail },
  })
  if (customUser) {
    await prisma.clubMember.update({
      where: { userId_clubId: { userId: customUser.id, clubId: club.id } },
      data: {
        roleId: tesoreroJunior.id,
        role: 'MEMBER' as any, // legacy
      },
    })
    console.log(`  ✅ Rol custom asignado a ${customUserEmail}`)
  }

  console.log('')
  console.log('🎉 Seed JoinSport completo')
  console.log('')
  console.log('Credenciales:')
  console.log(`  Contraseña: ${PASSWORD_PLAIN}`)
  console.log(`  Admin del club: alvaro.ruiz@${EMAIL_DOMAIN}`)
  console.log(`  Tesorero: eduardo.blanco@${EMAIL_DOMAIN}`)
  console.log(`  Ojeador: fatima.guerrero@${EMAIL_DOMAIN}`)
  console.log(`  Jugador multi-equipo: adrian.hernandez@${EMAIL_DOMAIN}`)
  console.log(`  Con rol custom: fabiola.mendoza@${EMAIL_DOMAIN}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })