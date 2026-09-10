import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Crear el pool de conexiones para PostgreSQL
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Crear el adaptador de Prisma
    const adapter = new PrismaPg(pool);
    
    // Pasar el adaptador al constructor de PrismaClient
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}