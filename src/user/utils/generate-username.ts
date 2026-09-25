import { PrismaService } from '../../prisma/prisma.service'

/**
 * Genera un username único a partir del nombre y apellido.
 * Formato: @nombreapellido123 (número solo si hay colisión)
 *
 * - Normaliza acentos, quita caracteres no alfanuméricos
 * - Asegura unicidad consultando la BD
 * - Excluye opcionalmente un userId (útil al actualizar)
 */
export async function generateUniqueUsername(
  prisma: PrismaService,
  name: string,
  lastName: string,
  excludeUserId?: string,
): Promise<string> {
  const base = ((name?.[0] ?? '') + (lastName ?? ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, '')

  if (!base) {
    // Fallback raro, pero por si acaso
    return `@user${Date.now()}`
  }

  let username = `@${base}`
  let counter = 1

  while (true) {
    const existing = await prisma.user.findUnique({
      where: { username },
    })
    if (!existing || existing.id === excludeUserId) {
      return username
    }
    counter++
    username = `@${base}${counter}`
  }
}