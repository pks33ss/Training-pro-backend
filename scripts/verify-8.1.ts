// backend/scripts/verify-8.1.ts
// Lote 8.1 — Verificación final (tras Fase C)
import { prisma } from '../prisma/_client'

async function main() {
  const clubs = await prisma.club.count()
  const roles = await prisma.role.count()
  const rolesSystem = await prisma.role.count({ where: { isSystem: true } })
  const perms = await prisma.rolePermission.count()
  const cmTotal = await prisma.clubMember.count()
  const mrTotal = await prisma.membershipRole.count()

  // Tras Fase C, roleId es NOT NULL. Contamos filas con roleRef roto (no debería haber).
  const cmSinRole = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "ClubMember" WHERE "roleId" IS NULL
  `
  const mrSinRole = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "MembershipRole" WHERE "roleId" IS NULL
  `
  const cmNull = Number(cmSinRole[0]?.n ?? 0)
  const mrNull = Number(mrSinRole[0]?.n ?? 0)

  const expectedRoles = clubs * 8
  const okRoles = rolesSystem === expectedRoles
  const okCm = cmNull === 0
  const okMr = mrNull === 0



  const sample = await prisma.club.findFirst({
    include: {
      roles: {
        include: { permissions: true },
        orderBy: [{ scope: 'asc' }, { name: 'asc' }],
      },
    },
  })
  if (sample) {

    for (const r of sample.roles) {
   
    }
  }

  if (!okRoles || !okCm || !okMr) process.exit(1)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })