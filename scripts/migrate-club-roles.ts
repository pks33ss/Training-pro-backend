import 'dotenv/config' // ✅ Carga el .env automáticamente
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

async function bootstrap() {
  // Verificamos que la URL se ha cargado bien
  console.log('🔗 Conectando a:', process.env.DATABASE_URL?.substring(0, 30) + '...')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })

  const prisma = app.get(PrismaService)

  console.log('🔄 Migrando ClubMember.roleId → ClubMemberRole...')

  const members = await prisma.clubMember.findMany({
    where: {
      clubMemberRoles: { none: {} },
    },
    include: {
      roleRef: { select: { id: true, name: true } },
    },
  })

  let created = 0
  for (const m of members) {
    if (!m.roleRef) continue

    await prisma.clubMemberRole.create({
      data: {
        clubMemberId: m.id,
        roleId: m.roleRef.id,
        scope: 'ALL',
      },
    })
    created++
  }

  console.log(`✅ Migrados ${created} miembros a ClubMemberRole.`)

  await app.close()
}

bootstrap().catch((e) => {
  console.error(e)
  process.exit(1)
})