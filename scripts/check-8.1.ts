// backend/scripts/verify-8.1.ts
// Lote 8.1 — Verificación final (tras Fase C)
import { prisma } from '../prisma/_client'

async function main() {
  const clubs = await prisma.club.count()
  const roles = await prisma.role.count()
  const rolesSystem = await prisma.role.count({ where: { isSystem: true } })
  const perms = await prisma.rolePermission.count()

  const cmNull = await prisma.clubMember.count({ where: { roleId: null } })
  const mrNull = await prisma.membershipRole.count({ where: { roleId: null } })

  const expectedRoles = clubs * 8
  const okRoles = rolesSystem === expectedRoles
  const okCm = cmNull === 0
  const okMr = mrNull === 0

  console.log('─── Verificación 8.1 ───')
  console.log(`Clubs: ${clubs}`)
  console.log(`Roles totales: ${roles} (sistema: ${rolesSystem}, esperados: ${expectedRoles})`)
  console.log(`RolePermission: ${perms}`)
  console.log(`ClubMember sin roleId: ${cmNull}`)
  console.log(`MembershipRole sin roleId: ${mrNull}`)
  console.log('───')
  console.log(`Roles de sistema OK: ${okRoles ? '✅' : '❌'}`)
  console.log(`ClubMember.roleId OK: ${okCm ? '✅' : '❌'}`)
  console.log(`MembershipRole.roleId OK: ${okMr ? '✅' : '❌'}`)

  const sample = await prisma.club.findFirst({
    include: {
      roles: {
        include: { permissions: true },
        orderBy: [{ scope: 'asc' }, { name: 'asc' }],
      },
    },
  })
  if (sample) {
    console.log(`\nClub de ejemplo: ${sample.name}`)
    for (const r of sample.roles) {
      console.log(`  [${r.scope}] ${r.name} — ${r.permissions.length} permisos (system=${r.isSystem}, default=${r.isDefault})`)
    }
  }

  if (!okRoles || !okCm || !okMr) process.exit(1)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })