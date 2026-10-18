// backend/scripts/seed-demo.ts
//
// Script de carga de datos DEMO para hacer capturas de pantalla.
// Todos los datos creados llevan el prefijo "[DEMO]" para poder limpiarlos
// sin tocar datos reales.
//
// Uso:
//   npx tsx scripts/seed-demo.ts           -> crea (o actualiza) los datos demo
//   npx tsx scripts/seed-demo.ts --clean   -> borra los datos demo existentes
//
// Requisitos:
//   - El club "cmv7yjcos00008gv4yu12ak9n" debe existir.
//   - El equipo "cmv7ykscj006v8gv4z5acnost" debe existir y pertenecer al club.
//   - El user "gonzalo.prieto@joinsportapp.com" debe existir y tener
//     membership activa en el equipo (para que sea el creador de las cosas).
//
// Este script NO toca:
//   - Datos existentes que no empiecen por "[DEMO]".
//   - Roles / permisos / memberships / clubMembers.
//   - El user Gonzalo (solo se lee).
//
// Para "pizarras tácticas": genera PNG en base64 con un canvas simple
// (verde + flechas blancas + círculo del equipo). No es una pizarra real,
// pero para capturas de redes da el pego. Sustituye por lo que quieras
// cuando lo tengas a mano.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const CLUB_ID = 'cmv7yjcos00008gv4yu12ak9n'
const TEAM_ID = 'cmv7ykscj006v8gv4z5acnost'
const AUTHOR_EMAIL = 'gonzalo.prieto@joinsportapp.com'
const DEMO = '[DEMO]'

// ============================================
// UTILIDADES
// ============================================

function daysAgo(n: number, hour = 18, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}

function daysFromNow(n: number, hour = 18, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, minute, 0, 0)
  return d
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Genera un PNG simple en base64 con un fondo verde tipo pista de baloncesto
 * y unas cuantas flechas blancas. Sirve como "pizarra táctica" para capturas.
 */
function generateTacticalBoardBase64(label: string): string {
  // SVG simple convertido a data URL. Los navegadores y Konva lo aceptan
  // como src de imagen, y es mucho más ligero que un PNG codificado.
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#1a5c2e"/>
  <rect x="20" y="20" width="360" height="360" fill="none" stroke="#ffffff" stroke-width="2"/>
  <line x1="200" y1="20" x2="200" y2="380" stroke="#ffffff" stroke-width="2"/>
  <circle cx="200" cy="200" r="50" fill="none" stroke="#ffffff" stroke-width="2"/>
  <circle cx="200" cy="200" r="6" fill="#ffffff"/>
  <path d="M100 320 Q 150 250 200 200" fill="none" stroke="#ffffff" stroke-width="3"/>
  <path d="M200 200 Q 250 150 300 100" fill="none" stroke="#ffffff" stroke-width="3"/>
  <polygon points="300,100 290,120 310,115" fill="#ffffff"/>
  <circle cx="120" cy="120" r="14" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
  <circle cx="120" cy="120" r="14" fill="none" stroke="#3b82f6" stroke-width="2"/>
  <text x="120" y="126" fill="#ffffff" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">4</text>
  <circle cx="280" cy="300" r="14" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
  <text x="280" y="306" fill="#ffffff" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">7</text>
  <circle cx="120" cy="300" r="14" fill="#f97316" stroke="#ffffff" stroke-width="2"/>
  <text x="120" y="306" fill="#ffffff" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">2</text>
  <text x="200" y="390" fill="#ffffff" font-size="12" font-family="sans-serif" text-anchor="middle" opacity="0.7">${escapeXml(label)}</text>
</svg>`.trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

// ============================================
// DATOS DE CONTENIDO
// ============================================

interface DemoExercise {
  name: string
  category: 'CALENTAMIENTO' | 'TÉCNICA' | 'TÁCTICA' | 'FÍSICO'
  duration: number
  difficulty: 'FÁCIL' | 'MEDIO' | 'DIFÍCIL'
  withBoard?: boolean
  withImage?: boolean
  withLink?: boolean
}

interface DemoSession {
  title: string
  description: string
  daysAgo: number
  duration: number
  location: string
  exercises: DemoExercise[]
}

const SESSIONS: DemoSession[] = [
  {
    title: `${DEMO} Fundamentos ofensivos · Bote y pase`,
    description: 'Sesión centrada en el control del bote y la precisión en el pase bajo presión.',
    daysAgo: 42,
    duration: 90,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento dinámico', category: 'CALENTAMIENTO', duration: 15, difficulty: 'FÁCIL' },
      { name: 'Bote de control en zig-zag', category: 'TÉCNICA', duration: 15, difficulty: 'FÁCIL', withLink: true },
      { name: 'Pases en movimiento 3x2', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Rondo 4x2 con bote obligatorio', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO' },
      { name: '1x1 desde medio campo', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO', withBoard: true },
      { name: 'Finalizaciones tras bote', category: 'TÉCNICA', duration: 10, difficulty: 'FÁCIL', withImage: true },
      { name: 'Tiro libre bajo fatiga', category: 'FÍSICO', duration: 5, difficulty: 'MEDIO' },
    ],
  },
  {
    title: `${DEMO} Tiro en movimiento · Mecánica`,
    description: 'Trabajo de mecánica de tiro en entradas, tiros tras bote y salidas de bloqueo.',
    daysAgo: 39,
    duration: 105,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento con balón', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Tiro estático por estaciones', category: 'TÉCNICA', duration: 20, difficulty: 'FÁCIL', withImage: true },
      { name: 'Tiro tras bote (5 posiciones)', category: 'TÉCNICA', duration: 20, difficulty: 'MEDIO', withLink: true },
      { name: 'Entradas a canasta por ambos lados', category: 'TÉCNICA', duration: 20, difficulty: 'MEDIO', withBoard: true },
      { name: 'Tiro saliendo de bloqueo', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Competición de tiros', category: 'FÍSICO', duration: 15, difficulty: 'MEDIO' },
    ],
  },
  {
    title: `${DEMO} Defensa individual · Desplazamientos`,
    description: 'Fundamentos de defensa individual: posición, desplazamiento lateral y ayudas.',
    daysAgo: 36,
    duration: 100,
    location: 'Pista exterior',
    exercises: [
      { name: 'Calentamiento y movilidad', category: 'CALENTAMIENTO', duration: 15, difficulty: 'FÁCIL' },
      { name: 'Desplazamientos defensivos', category: 'FÍSICO', duration: 15, difficulty: 'MEDIO', withLink: true },
      { name: 'Defensa de bote en 1x1', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Ayudas y recuperaciones', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', withBoard: true },
      { name: '3x3 defensivo con reglas', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Suicidas defensivos', category: 'FÍSICO', duration: 15, difficulty: 'DIFÍCIL' },
    ],
  },
  {
    title: `${DEMO} Pick and roll · Bloqueo directo`,
    description: 'Lecturas del bloqueo directo, continuación del pívot y decisiones del base.',
    daysAgo: 33,
    duration: 110,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento específico', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Bloqueo directo sin defensa', category: 'TÉCNICA', duration: 15, difficulty: 'FÁCIL', withBoard: true },
      { name: 'Lecturas 2x2', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO' },
      { name: 'Continuación del pívot (roll)', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', withLink: true },
      { name: 'Pick and roll 3x3', category: 'TÁCTICA', duration: 25, difficulty: 'DIFÍCIL' },
      { name: 'Tiro tras bloqueo', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Tiros libres finales', category: 'FÍSICO', duration: 10, difficulty: 'FÁCIL' },
    ],
  },
  {
    title: `${DEMO} Transiciones rápidas · 3x2 y 2x1`,
    description: 'Contraataque y decisiones en superioridad numérica.',
    daysAgo: 30,
    duration: 95,
    location: 'Pista exterior',
    exercises: [
      { name: 'Calentamiento con carrera', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Salidas rápidas tras rebote', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: '3x2 en medio campo', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO', withBoard: true },
      { name: '2x1 con finalización', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Transiciones 5x5', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Sprints y recuperación', category: 'FÍSICO', duration: 15, difficulty: 'DIFÍCIL' },
    ],
  },
  {
    title: `${DEMO} Rebote ofensivo y defensivo`,
    description: 'Posicionamiento, bloqueo de rebote y segundas oportunidades.',
    daysAgo: 27,
    duration: 90,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento y saltos', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Bloqueo de rebote', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', withImage: true },
      { name: 'Rebote en 3x3', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO' },
      { name: 'Segundas oportunidades', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO', withBoard: true },
      { name: 'Contacto controlado', category: 'FÍSICO', duration: 15, difficulty: 'DIFÍCIL' },
      { name: 'Tiros libres', category: 'TÉCNICA', duration: 15, difficulty: 'FÁCIL' },
    ],
  },
  {
    title: `${DEMO} 1x1 · Fintas y cambios de dirección`,
    description: 'Trabajo técnico y táctico del uno contra uno.',
    daysAgo: 24,
    duration: 100,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento con balón', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Cambios de mano', category: 'TÉCNICA', duration: 15, difficulty: 'FÁCIL', withLink: true },
      { name: 'Fintas de salida', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: '1x1 desde triple', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO', withBoard: true },
      { name: '1x1 con bote limitado', category: 'TÁCTICA', duration: 15, difficulty: 'DIFÍCIL' },
      { name: 'Competición de 1x1', category: 'TÁCTICA', duration: 15, difficulty: 'DIFÍCIL' },
      { name: 'Flexibilidad y estiramientos', category: 'FÍSICO', duration: 10, difficulty: 'FÁCIL' },
    ],
  },
  {
    title: `${DEMO} 5x5 · Ataque por conceptos`,
    description: 'Ataque posicional con spacing, cortes y bloqueos indirectos.',
    daysAgo: 21,
    duration: 120,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento general', category: 'CALENTAMIENTO', duration: 15, difficulty: 'FÁCIL' },
      { name: 'Spacing y pases de seguridad', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Cortes de backdoor', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO', withLink: true },
      { name: 'Bloqueos indirectos', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', withBoard: true },
      { name: '5x5 controlado', category: 'TÁCTICA', duration: 30, difficulty: 'DIFÍCIL' },
      { name: 'Tiro libre', category: 'FÍSICO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Estiramientos', category: 'FÍSICO', duration: 10, difficulty: 'FÁCIL' },
    ],
  },
  {
    title: `${DEMO} Juego de pies · Pivotar y salir`,
    description: 'Trabajo específico de pies y salidas tras recepción.',
    daysAgo: 18,
    duration: 95,
    location: 'Pista exterior',
    exercises: [
      { name: 'Calentamiento articular', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Pivotar y proteger balón', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Salida en dribble', category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', withImage: true },
      { name: 'Recepción y ataque en 3 tiempos', category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO', withBoard: true },
      { name: '1x1 desde poste bajo', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Tiro libre bajo presión', category: 'FÍSICO', duration: 15, difficulty: 'MEDIO' },
    ],
  },
  {
    title: `${DEMO} Tiro de tres · Situaciones reales`,
    description: 'Tiros de tres desde situaciones de partido: catch and shoot, tras bote y saliendo de bloqueo.',
    daysAgo: 14,
    duration: 100,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento con tiro', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Catch and shoot', category: 'TÉCNICA', duration: 20, difficulty: 'MEDIO', withLink: true },
      { name: 'Tiro tras bote lateral', category: 'TÉCNICA', duration: 20, difficulty: 'MEDIO' },
      { name: 'Tiro saliendo de bloqueo', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', withBoard: true },
      { name: 'Competición de triples', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO' },
      { name: 'Tiros bajo fatiga', category: 'FÍSICO', duration: 15, difficulty: 'DIFÍCIL' },
    ],
  },
  {
    title: `${DEMO} Defensa en zona · 2-3 y 1-3-1`,
    description: 'Principios de la defensa en zona y ajustes según el ataque.',
    daysAgo: 10,
    duration: 105,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento y desplazamientos', category: 'CALENTAMIENTO', duration: 15, difficulty: 'FÁCIL' },
      { name: 'Posiciones base 2-3', category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO', withImage: true },
      { name: 'Rotaciones 2-3', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', withBoard: true },
      { name: 'Ataque vs 2-3', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: '1-3-1 trampa', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Sprints y recuperación', category: 'FÍSICO', duration: 15, difficulty: 'MEDIO' },
    ],
  },
  {
    title: `${DEMO} Partido reducido · 3x3 y 4x4`,
    description: 'Competición con reglas específicas para reforzar conceptos ofensivos y defensivos.',
    daysAgo: 5,
    duration: 110,
    location: 'Pabellón Municipal',
    exercises: [
      { name: 'Calentamiento general', category: 'CALENTAMIENTO', duration: 10, difficulty: 'FÁCIL' },
      { name: '3x3 con reglas', category: 'TÁCTICA', duration: 25, difficulty: 'MEDIO', withBoard: true },
      { name: '4x4 con spacing', category: 'TÁCTICA', duration: 25, difficulty: 'MEDIO' },
      { name: '5x5 con puntuación extra', category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL' },
      { name: 'Tiro libre final', category: 'TÉCNICA', duration: 10, difficulty: 'FÁCIL' },
      { name: 'Estiramientos', category: 'FÍSICO', duration: 10, difficulty: 'FÁCIL' },
    ],
  },
]

// ============================================
// BLOQUE 1: LIMPIAR DATOS DEMO
// ============================================

async function cleanDemo() {
  console.log('🧹 Limpiando datos demo...')

  const sessions = await prisma.session.deleteMany({
    where: { teamId: TEAM_ID, title: { startsWith: DEMO } },
  })
  console.log(`   Sesiones borradas: ${sessions.count}`)

  const matches = await prisma.match.deleteMany({
    where: { teamId: TEAM_ID, opponent: { startsWith: DEMO } },
  })
  console.log(`   Partidos borrados: ${matches.count}`)

  const plays = await prisma.play.deleteMany({
    where: { teamId: TEAM_ID, name: { startsWith: DEMO } },
  })
  console.log(`   Jugadas borradas: ${plays.count}`)

  // Biblioteca: buscar el user por email y borrar los suyos
  const author = await prisma.user.findUnique({
    where: { email: AUTHOR_EMAIL },
    select: { id: true },
  })
  if (author) {
    const lib = await prisma.libraryExercise.deleteMany({
      where: { ownerId: author.id, name: { startsWith: DEMO } },
    })
    console.log(`   Ejercicios de biblioteca borrados: ${lib.count}`)
  }

  console.log('✅ Limpieza completada.')
}

// ============================================
// BLOQUE 2: VERIFICAR CONTEXTO
// ============================================

async function verifyContext() {
  console.log('\n🔍 Verificando contexto...')

  const club = await prisma.club.findUnique({ where: { id: CLUB_ID } })
  if (!club) {
    throw new Error(`No existe el club ${CLUB_ID}`)
  }
  console.log(`   Club OK: ${club.name}`)

  const team = await prisma.team.findUnique({
    where: { id: TEAM_ID },
    include: { club: true },
  })
  if (!team) {
    throw new Error(`No existe el equipo ${TEAM_ID}`)
  }
  if (team.clubId !== CLUB_ID) {
    throw new Error(
      `El equipo ${TEAM_ID} no pertenece al club ${CLUB_ID} (pertenece a ${team.clubId})`,
    )
  }
  console.log(`   Equipo OK: ${team.name} (${team.sport})`)

  const author = await prisma.user.findUnique({
    where: { email: AUTHOR_EMAIL },
    select: { id: true, name: true, lastName: true },
  })
  if (!author) {
    throw new Error(`No existe el user con email ${AUTHOR_EMAIL}`)
  }
  console.log(`   Autor OK: ${author.name} ${author.lastName}`)

  // Verificar membership activa del autor en el equipo
  const membership = await prisma.teamMembership.findFirst({
    where: { userId: author.id, teamId: TEAM_ID, status: 'ACTIVE' },
  })
  if (!membership) {
    throw new Error(
      `El autor ${AUTHOR_EMAIL} no tiene membership ACTIVA en el equipo ${TEAM_ID}`,
    )
  }
  console.log(`   Membership activa del autor OK`)

  // Jugadores del equipo (para stats y convocatorias)
        const players = await prisma.teamMembership.findMany({
    where: {
      teamId: TEAM_ID,
      status: 'ACTIVE',
      roles: { some: { roleRef: { name: 'PLAYER' } } },
    },
    select: {
      id: true,
      jerseyNumber: true,
      position: true,
      user: { select: { id: true, name: true, lastName: true } },
    },
    orderBy: { jerseyNumber: 'asc' },
  })

  if (players.length < 8) {
    throw new Error(
      `El equipo solo tiene ${players.length} jugadores; necesitamos al menos 8 para generar partidos.`,
    )
  }
  console.log(`   Jugadores OK: ${players.length} jugadores activos`)

  return { author, team, players }
}

// ============================================
// BLOQUE 3: SESIONES
// ============================================

const SESSION_LINKS = [
  'https://www.youtube.com/watch?v=Z1nq8q-6T7M',
  'https://www.youtube.com/watch?v=2z8v7rF1q-c',
  'https://www.youtube.com/watch?v=pKx0H8bPvIs',
]

const SESSION_IMAGES = [
  'https://picsum.photos/seed/basketball1/800/600',
  'https://picsum.photos/seed/basketball2/800/600',
  'https://picsum.photos/seed/basketball3/800/600',
  'https://picsum.photos/seed/basketball4/800/600',
]

async function seedSessions(authorId: string) {
  console.log('\n🏋️  Creando sesiones...')

  let created = 0
  let idx = 0

  for (const s of SESSIONS) {
    idx++

    // Crear la sesión
    const session = await prisma.session.create({
      data: {
        title: s.title,
        description: s.description,
        date: daysAgo(s.daysAgo, 18, 30),
        duration: s.duration,
        location: s.location,
        teamId: TEAM_ID,
        createdById: authorId,
      },
    })

    // Crear ejercicios + media
    for (let i = 0; i < s.exercises.length; i++) {
      const ex = s.exercises[i]
      const exercise = await prisma.exercise.create({
        data: {
          name: ex.name,
          description: `${ex.name} — parte de la sesión "${s.title.replace(DEMO, '').trim()}".`,
          category: ex.category,
          duration: ex.duration,
          difficulty: ex.difficulty,
          sessionId: session.id,
          order: i,
        },
      })

      if (ex.withBoard) {
        const board = generateTacticalBoardBase64(ex.name)
        await prisma.media.create({
          data: {
            url: board,
            type: 'IMAGE',
            title: 'Pizarra táctica',
            exerciseId: exercise.id,
          },
        })
      }

      if (ex.withImage) {
        const img = SESSION_IMAGES[idx % SESSION_IMAGES.length]
        await prisma.media.create({
          data: {
            url: img,
            type: 'IMAGE',
            title: 'Imagen del ejercicio',
            exerciseId: exercise.id,
          },
        })
      }

      if (ex.withLink) {
        const link = SESSION_LINKS[idx % SESSION_LINKS.length]
        await prisma.media.create({
          data: {
            url: link,
            type: 'LINK',
            title: 'Vídeo de referencia',
            exerciseId: exercise.id,
          },
        })
      }
    }

    created++
    console.log(`   [${created}/${SESSIONS.length}] ${s.title}`)
  }

  return created
}

// ============================================
// BLOQUE 4: PARTIDOS + STATS
// ============================================

interface DemoMatch {
  opponent: string
  daysOffset: number // + futuro, - pasado
  isHome: boolean
  type: 'LEAGUE' | 'FRIENDLY'
  teamScore?: number
  opponentScore?: number
  season: string
  venue: string
}

const MATCHES: DemoMatch[] = [
  {
    opponent: `${DEMO} CB Alcalá`,
    daysOffset: -28,
    isHome: true,
    type: 'LEAGUE',
    teamScore: 72,
    opponentScore: 65,
    season: '2025-2026',
    venue: 'Pabellón Municipal',
  },
  {
    opponent: `${DEMO} Real Canoe B`,
    daysOffset: -21,
    isHome: false,
    type: 'FRIENDLY',
    teamScore: 58,
    opponentScore: 61,
    season: '2025-2026',
    venue: 'Pabellón Canoe',
  },
  {
    opponent: `${DEMO} Baloncesto Fuenlabrada`,
    daysOffset: -14,
    isHome: true,
    type: 'LEAGUE',
    teamScore: 80,
    opponentScore: 74,
    season: '2025-2026',
    venue: 'Pabellón Municipal',
  },
  {
    opponent: `${DEMO} CB Pozuelo`,
    daysOffset: -7,
    isHome: false,
    type: 'LEAGUE',
    teamScore: 68,
    opponentScore: 70,
    season: '2025-2026',
    venue: 'Pabellón Pozuelo',
  },
  {
    opponent: `${DEMO} Colegio Brains`,
    daysOffset: 7,
    isHome: true,
    type: 'LEAGUE',
    season: '2025-2026',
    venue: 'Pabellón Municipal',
  },
]

/**
 * Genera estadísticas realistas para un jugador según su posición.
 * Usa un seed fijo por (matchIdx, playerIdx) para que sea determinista.
 */
function generatePlayerStats(
  position: string | null,
  matchIdx: number,
  playerIdx: number,
) {
  // Hash determinista
  const seed = (matchIdx + 1) * 1000 + (playerIdx + 1) * 37
  const rnd = (n: number) => {
    let x = seed * 9301 + n * 49297
    x = (x * 9301 + 49297) % 233280
    return (x / 233280)
  }

  const pos = (position ?? 'ALERO').toUpperCase()

  // Números base por posición
  const base = {
    BASE:    { pts: [6, 14], ast: [4, 8], reb: [2, 4], stl: [1, 3], blk: [0, 1], min: [22, 30] },
    ESCOLTA: { pts: [10, 20], ast: [2, 5], reb: [2, 4], stl: [1, 3], blk: [0, 1], min: [20, 30] },
    ALERO:   { pts: [8, 18], ast: [1, 4], reb: [3, 6], stl: [0, 2], blk: [0, 1], min: [20, 30] },
    'ALA-PÍVOT': { pts: [8, 16], ast: [1, 3], reb: [5, 8], stl: [0, 2], blk: [1, 2], min: [18, 28] },
    'ALA-PIVOT': { pts: [8, 16], ast: [1, 3], reb: [5, 8], stl: [0, 2], blk: [1, 2], min: [18, 28] },
    PÍVOT:   { pts: [8, 14], ast: [1, 2], reb: [7, 11], stl: [0, 1], blk: [1, 3], min: [18, 28] },
    PIVOT:   { pts: [8, 14], ast: [1, 2], reb: [7, 11], stl: [0, 1], blk: [1, 3], min: [18, 28] },
  } as const

  const range = (base as any)[pos] ?? base.ALERO
  const pick = (r: [number, number], k: number) => {
    const v = Math.floor(rnd(k) * (r[1] - r[0] + 1)) + r[0]
    return v
  }

  const points = pick(range.pts as [number, number], 1)
  const assists = pick(range.ast as [number, number], 2)
  const rebounds = pick(range.reb as [number, number], 3)
  const steals = pick(range.stl as [number, number], 4)
  const blocks = pick(range.blk as [number, number], 5)
  const minutes = pick(range.min as [number, number], 6)
  const turnovers = Math.max(0, Math.floor(rnd(7) * 3))
  const fouls = Math.max(0, Math.floor(rnd(8) * 4))

  // Tiros: derivar de puntos de forma realista
  // Reparto de puntos: 1/3 de triples, 1/2 de 2s, resto TL
  const threePoints = Math.floor(points * 0.3) // puntos anotados desde el triple
  const freeThrowsPoints = Math.floor(points * 0.15)
  const twoPoints = points - threePoints - freeThrowsPoints

  const threeAttempts = Math.max(1, Math.round(threePoints / 3 / 0.33))
  const threeMades = Math.round(threePoints / 3)

  const ftAttempts = Math.max(0, Math.round(freeThrowsPoints / 0.75))
  const ftMades = freeThrowsPoints

  const fgAttempts = Math.max(1, Math.round(twoPoints / 2 / 0.48) + threeAttempts)
  const fgMades = Math.round(twoPoints / 2) + threeMades

  return {
    minutes,
    points,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers,
    fouls,
    fieldGoalsMade: fgMades,
    fieldGoalsAttempted: fgAttempts,
    threePointersMade: threeMades,
    threePointersAttempted: threeAttempts,
    freeThrowsMade: ftMades,
    freeThrowsAttempted: ftAttempts,
    blocksAgainst: 0,
    foulsDrawn: Math.max(0, Math.floor(rnd(9) * 3)),
    plusMinus: pick([-10, 15] as [number, number], 10),
  }
}

async function seedMatches(authorId: string, players: any[]) {
  console.log('\n🏀 Creando partidos y estadísticas...')

  let created = 0

  for (let mIdx = 0; mIdx < MATCHES.length; mIdx++) {
    const m = MATCHES[mIdx]
    const date = m.daysOffset < 0 ? daysAgo(-m.daysOffset, 19, 0) : daysFromNow(m.daysOffset, 19, 0)

    const match = await prisma.match.create({
      data: {
        date,
        opponent: m.opponent,
        location: m.isHome ? 'HOME' : 'AWAY',
        type: m.type,
        status: m.teamScore !== undefined ? 'FINISHED' : 'SCHEDULED',
        venue: m.venue,
        competition: m.type === 'LEAGUE' ? 'Liga regular' : 'Amistoso',
        teamScore: m.teamScore ?? null,
        opponentScore: m.opponentScore ?? null,
        season: m.season,
        teamId: TEAM_ID,
        createdById: authorId,
      },
    })

    // Convocar a 10 jugadores (o los que haya)
    const convocados = players.slice(0, Math.min(10, players.length))
    for (const p of convocados) {
      await prisma.matchCallup.create({
        data: {
          matchId: match.id,
          userId: p.user.id,
          availableStatus: 'YES',
          calledUpStatus: 'YES',
          confirmedStatus: 'YES',
          status: 'CONFIRMED',
          respondedAt: new Date(),
        },
      })
    }

    // Si el partido ya está jugado, meter stats
    if (m.teamScore !== undefined) {
            for (let pIdx = 0; pIdx < convocados.length; pIdx++) {
                const p = convocados[pIdx]
        const stats = generatePlayerStats(p.position, mIdx, pIdx)
        await prisma.matchPlayerStats.create({
          data: {
            matchId: match.id,
            userId: p.user.id,
            ...stats,
          },
        })
      }
    }

    created++
    console.log(
      `   [${created}/${MATCHES.length}] ${m.opponent} ${m.teamScore !== undefined ? `(${m.teamScore}-${m.opponentScore})` : '(por jugar)'}`,
    )
  }

  return created
}

// ============================================
// BLOQUE 5: BIBLIOTECA
// ============================================

const LIBRARY_EXERCISES = [
  { name: `${DEMO} Rueda de pases`, category: 'TÉCNICA', duration: 10, difficulty: 'FÁCIL', tags: ['pases', 'calentamiento'] },
  { name: `${DEMO} Tiro en movimiento desde el codo`, category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', tags: ['tiro', 'mecánica'] },
  { name: `${DEMO} 1x1 defensivo en media pista`, category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO', tags: ['defensa', '1x1'] },
  { name: `${DEMO} Pick and roll · Bloqueo directo`, category: 'TÁCTICA', duration: 20, difficulty: 'MEDIO', tags: ['pick-and-roll', 'bloqueo'] },
  { name: `${DEMO} Rondo 4x2`, category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', tags: ['rondo', 'pases'] },
  { name: `${DEMO} Transición 3x2`, category: 'TÁCTICA', duration: 15, difficulty: 'MEDIO', tags: ['transición', 'contraataque'] },
  { name: `${DEMO} Finalización con contacto`, category: 'TÉCNICA', duration: 10, difficulty: 'DIFÍCIL', tags: ['finalización', 'contacto'] },
  { name: `${DEMO} Tiro tras bote`, category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', tags: ['tiro', 'bote'] },
  { name: `${DEMO} Defensa del bloqueo`, category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', tags: ['defensa', 'bloqueo'] },
  { name: `${DEMO} Juego de pies en poste bajo`, category: 'TÉCNICA', duration: 15, difficulty: 'MEDIO', tags: ['poste', 'pies'] },
  { name: `${DEMO} Salida de presión`, category: 'TÁCTICA', duration: 20, difficulty: 'DIFÍCIL', tags: ['presión', 'salida'] },
  { name: `${DEMO} Tiro libre bajo fatiga`, category: 'FÍSICO', duration: 10, difficulty: 'MEDIO', tags: ['tiro-libre', 'fatiga'] },
]

async function seedLibrary(authorId: string) {
  console.log('\n📚 Creando ejercicios de biblioteca...')

  let created = 0
  for (let i = 0; i < LIBRARY_EXERCISES.length; i++) {
    const ex = LIBRARY_EXERCISES[i]
    const lib = await prisma.libraryExercise.create({
      data: {
        ownerId: authorId,
        name: ex.name,
        description: `Ejercicio de ${ex.category.toLowerCase()} para trabajar ${ex.tags.join(', ')}.`,
        category: ex.category,
        tags: ex.tags,
        duration: ex.duration,
        difficulty: ex.difficulty,
      },
    })

    // Añadir una pizarra táctica a algunos (1 de cada 3)
    if (i % 3 === 0) {
      const board = generateTacticalBoardBase64(ex.name)
      await prisma.libraryMedia.create({
        data: {
          url: board,
          type: 'IMAGE',
          title: 'Pizarra táctica',
          libraryExerciseId: lib.id,
        },
      })
    }

    // Añadir un link a algunos (1 de cada 4)
    if (i % 4 === 1) {
      await prisma.libraryMedia.create({
        data: {
          url: SESSION_LINKS[i % SESSION_LINKS.length],
          type: 'LINK',
          title: 'Vídeo de referencia',
          libraryExerciseId: lib.id,
        },
      })
    }

    created++
    console.log(`   [${created}/${LIBRARY_EXERCISES.length}] ${ex.name}`)
  }

  return created
}

// ============================================
// BLOQUE 6: PLAYBOOK
// ============================================

const PLAYS = [
  {
    name: `${DEMO} Pick and roll clásico`,
    description: 'Bloqueo directo del pívot al base, continuación al aro y opciones de tiro.',
    steps: [
      'El base bota hacia el lado del pívot, que sube a bloquear.',
      'El pívot hace el bloqueo y continúa hacia el aro (roll).',
      'El base lee: si el defensor del pívot se queda, pase interior; si ayuda, tiro exterior.',
      'El alero se abre al ala para recibir si el base no tiene opción.',
    ],
  },
  {
    name: `${DEMO} Bloqueo ciego + continuación`,
    description: 'Bloqueo sin balón al tirador, apertura y continuación del bloqueador.',
    steps: [
      'El tirador se mueve por la línea de fondo hacia el lado del bloqueo.',
      'El bloqueador hace un bloqueo ciego (back screen).',
      'El tirador sale al triple y recibe el pase.',
      'El bloqueador, tras el bloqueo, continúa al aro (slip o roll).',
    ],
  },
  {
    name: `${DEMO} Ataque a zona 2-3`,
    description: 'Ataque posicional contra defensa en zona 2-3 con tiros y cortes.',
    steps: [
      'Spacing inicial: 2 aleros abiertos, 1 jugador en el tiro libre, 2 en poste.',
      'Pase al tiro libre para obligar a la defensa a colapsar.',
      'Corte del alero por la línea de fondo.',
      'Pase al alero o tiro exterior desde el 45° si la defensa no se ajusta.',
    ],
  },
  {
    name: `${DEMO} Transición con pase largo`,
    description: 'Contraataque rápido tras rebote con pase de béisbol al alero.',
    steps: [
      'El pívot captura el rebote defensivo.',
      'El base pide el balón y se abre por el centro.',
      'Pase largo al alero que corre por la banda.',
      'El alero finaliza en bandeja o dobla al trailer.',
    ],
  },
  {
    name: `${DEMO} Jugada de saque de fondo`,
    description: 'Jugada de saque de fondo para situación de partido igualado.',
    steps: [
      'El sacador se coloca en la línea de fondo, con 4 jugadores en formación de caja.',
      'El tirador sale por el bloqueo del pívot hacia el triple.',
      'El pívot hace un bloqueo al sacador y se abre al tiro libre.',
      'El sacador elige: pase al tirador o pase al pívot en el tiro libre.',
    ],
  },
]

async function seedPlaybook(authorId: string) {
  console.log('\n🎬 Creando jugadas de playbook...')

  let created = 0
  for (let i = 0; i < PLAYS.length; i++) {
    const p = PLAYS[i]
    const play = await prisma.play.create({
      data: {
        name: p.name,
        description: p.description,
        teamId: TEAM_ID,
        createdById: authorId,
      },
    })

    for (let sIdx = 0; sIdx < p.steps.length; sIdx++) {
      const stepDesc = p.steps[sIdx]
      const withImage = sIdx === 0 // solo el primer paso lleva imagen
      await prisma.playStep.create({
        data: {
          playId: play.id,
          order: sIdx,
          description: stepDesc,
          imageUrl: withImage ? generateTacticalBoardBase64(p.name) : null,
        },
      })
    }

    created++
    console.log(`   [${created}/${PLAYS.length}] ${p.name}`)
  }

  return created
}

// ============================================
// BLOQUE 7: LIVE STREAM (para el partido futuro)
// ============================================

async function seedLiveStreamForFutureMatch(authorId: string) {
  console.log('\n📺 Añadiendo LiveStream al partido futuro...')

  const futureMatch = await prisma.match.findFirst({
    where: { teamId: TEAM_ID, opponent: { startsWith: DEMO }, status: 'SCHEDULED' },
    orderBy: { date: 'desc' },
  })

  if (!futureMatch) {
    console.log('   ⚠️  No hay partido futuro; se omite LiveStream')
    return
  }

  const existing = await prisma.liveStream.findUnique({
    where: { matchId: futureMatch.id },
  })
  if (existing) {
    console.log('   ℹ️  Ya existe LiveStream para ese partido, no se duplica')
    return
  }

  await prisma.liveStream.create({
    data: {
      matchId: futureMatch.id,
      hostId: authorId,
      isLive: false,
      streamingEnabled: false,
      maxUsers: 20,
      scoreboardEnabled: true,
      clockEnabled: true,
      homeTeamName: 'JoinBasketball',
      awayTeamName: futureMatch.opponent.replace(DEMO, '').trim(),
      homeScore: 0,
      awayScore: 0,
      clockSeconds: 600,
      clockDuration: 600,
      clockRunning: false,
      clockDirection: 'DOWN',
      currentPeriod: 1,
    },
  })

  console.log(`   ✅ LiveStream creado para el partido del ${futureMatch.date.toLocaleDateString('es-ES')}`)
}

// ============================================
// MAIN
// ============================================

async function main() {
  const isClean = process.argv.includes('--clean')

  console.log('═══════════════════════════════════════════════')
  console.log('  JoinSport · Script de carga DEMO')
  console.log('═══════════════════════════════════════════════')

  if (isClean) {
    await cleanDemo()
    console.log('\n🎉 Modo --clean completado. No se ha creado nada nuevo.')
    return
  }

  const { author, players } = await verifyContext()

  const sessionsCount = await seedSessions(author.id)
  const matchesCount = await seedMatches(author.id, players)
  const libraryCount = await seedLibrary(author.id)
  const playsCount = await seedPlaybook(author.id)
  await seedLiveStreamForFutureMatch(author.id)

  console.log('\n═══════════════════════════════════════════════')
  console.log('  ✅ Resumen:')
  console.log(`     Sesiones:           ${sessionsCount}`)
  console.log(`     Partidos:           ${matchesCount}`)
  console.log(`     Biblioteca:         ${libraryCount}`)
  console.log(`     Jugadas:            ${playsCount}`)
  console.log('═══════════════════════════════════════════════')
  console.log('\n💡 Si quieres borrar todo lo demo, ejecuta:')
  console.log('   npx tsx scripts/seed-demo.ts --clean\n')
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })