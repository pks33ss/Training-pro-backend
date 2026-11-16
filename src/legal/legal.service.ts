import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateLegalConfigDto } from './dto/update-legal-config.dto'

const SINGLETON_ID = 'singleton'

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve la config legal. Si no existe, devuelve un objeto vacío
   * con valores por defecto (para que el frontend no rompa).
   */
  async getConfig() {
    const config = await this.prisma.legalConfig.findUnique({
      where: { id: SINGLETON_ID },
    })

    if (!config) {
      return {
        id: SINGLETON_ID,
        razonSocial: null,
        nif: null,
        direccion: null,
        ciudad: null,
        codigoPostal: null,
        pais: 'España',
        telefono: null,
        emailContacto: null,
        emailPrivacidad: null,
        emailCookies: null,
        registroMercantil: null,
        dominio: null,
        actividad: null,
        updatedAt: null,
        updatedBy: null,
        isConfigured: false,
      }
    }

    // isConfigured = true solo si los campos mínimos están rellenos
    const isConfigured = !!(config.razonSocial && config.nif && config.direccion)

    return { ...config, isConfigured }
  }

  /**
   * Upsert de la config legal. Solo SUPER_ADMIN (lo valida el guard).
   */
  async updateConfig(dto: UpdateLegalConfigDto, userId: string) {
    return this.prisma.legalConfig.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        ...dto,
        updatedBy: userId,
      },
      update: {
        ...dto,
        updatedBy: userId,
      },
    })
  }
}