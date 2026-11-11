import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

const DEFAULT_PERMISSIONS: Record<string, { resource: string; action: string }[]> = {
  ADMIN_CLUB: [
    { resource: 'club_settings', action: 'view' },
    { resource: 'club_settings', action: 'edit' },
    { resource: 'team', action: 'view' },
    { resource: 'team', action: 'create' },
    { resource: 'team', action: 'edit' },
    { resource: 'team', action: 'delete' },
    { resource: 'member', action: 'view' },
    { resource: 'member', action: 'create' },
    { resource: 'member', action: 'edit' },
    { resource: 'member', action: 'delete' },
    { resource: 'event', action: 'view' },
    { resource: 'event', action: 'create' },
    { resource: 'event', action: 'edit' },
    { resource: 'event', action: 'delete' },
    { resource: 'report', action: 'view' },
    { resource: 'document', action: 'view' },
    { resource: 'payment', action: 'view' },
    { resource: 'payment', action: 'create' },
    { resource: 'payment', action: 'edit' },
    { resource: 'invitation', action: 'create' },
    { resource: 'club_branding', action: 'view' },
    { resource: 'club_branding', action: 'edit' },
  ],
  COACH: [
    { resource: 'team', action: 'view' },
    { resource: 'member', action: 'view' },
    { resource: 'event', action: 'view' },
    { resource: 'event', action: 'create' },
    { resource: 'event', action: 'edit' },
    { resource: 'report', action: 'view' },
    { resource: 'document', action: 'view' },
  ],
  ASSISTANT: [
    { resource: 'team', action: 'view' },
    { resource: 'member', action: 'view' },
    { resource: 'event', action: 'view' },
    { resource: 'report', action: 'view' },
    { resource: 'document', action: 'view' },
  ],
  MEMBER: [
    { resource: 'team', action: 'view' },
    { resource: 'event', action: 'view' },
    { resource: 'document', action: 'view' },
    { resource: 'payment', action: 'view' },
  ],
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  const prisma = app.get(PrismaService)

  console.log('🔄 Buscando clubes sin permisos...')

  const clubs = await prisma.club.findMany({
    select: { id: true, name: true, roles: true }
  })

  let fixed = 0

  for (const club of clubs) {
    for (const role of club.roles) {
      const defaultPerms = DEFAULT_PERMISSIONS[role.name]
      if (!defaultPerms) continue

      // Verificar si ya tiene permisos
      const existing = await prisma.rolePermission.count({
        where: { roleId: role.id }
      })

      if (existing === 0) {
        // Asignar los permisos por defecto
        await prisma.rolePermission.createMany({
          data: defaultPerms.map(p => ({
            roleId: role.id,
            resource: p.resource,
            action: p.action,
            granted: true,
          }))
        })
        console.log(`✅ Club "${club.name}" - Rol ${role.name}: ${defaultPerms.length} permisos asignados`)
        fixed++
      }
    }
  }

  console.log(`🎉 Proceso completado. Roles corregidos: ${fixed}`)
  await app.close()
}

bootstrap().catch(e => { console.error(e); process.exit(1) })