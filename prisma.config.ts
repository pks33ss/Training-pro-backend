import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Usa la URL directa (sin -pooler) para las migraciones
    url: env('DATABASE_URL_UNPOOLED'), 
  },
})