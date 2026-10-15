import { PrismaService } from '../../prisma/prisma.service'

/**
 * Genera un username único a partir del nombre y apellido.
 *
 * Formato por defecto (con apellido):
 *   @<inicial_nombre><apellido>          → Juan Pérez → @jperez
 * Si no hay apellido:
 *   @<nombre_completo>                   → Juan        → @juan
 * Si la base queda vacía:
 *   @user<timestamp>
 *
 * Si hay colisión, añade un número incremental:
 *   @jperez, @jperez2, @jperez3, …
 *
 * - Normaliza acentos y quita caracteres no alfanuméricos.
 * - Asegura unicidad consultando la BD.
 * - Excluye opcionalmente un userId (útil al actualizar un usuario existente).
 */
export async function generateUniqueUsername(
  prisma: PrismaService,
  name: string,
  lastName: string,
  excludeUserId?: string,
): Promise<string> {
  const normalize = (s: string | null | undefined): string =>
    (s ?? '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^a-z0-9]/g, '')       // quita espacios y símbolos

  const cleanName = normalize(name)
  const cleanLastName = normalize(lastName)

  // Reglas:
  //  - Si hay apellido: inicial del nombre + apellido completo.
  //  - Si NO hay apellido: nombre completo.
  //  - Si no hay ninguno: fallback.
  let base = ''
  if (cleanLastName) {
    const initial = cleanName.charAt(0)
    base = `${initial}${cleanLastName}`
  } else if (cleanName) {
    base = cleanName
  }

  if (!base) {
    // Fallback por si no llega ni nombre ni apellido
    return `@user${Date.now()}`
  }

  let username = `@${base}`
  let counter = 1

  while (true) {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!existing || existing.id === excludeUserId) {
      return username
    }
    counter++
    username = `@${base}${counter}`
  }
}