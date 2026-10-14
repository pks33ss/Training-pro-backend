// backend/prisma/_client.ts
// Lote 8.1 — Cliente Prisma para scripts (Prisma 7 + driver adapter)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en el entorno')
}

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter })