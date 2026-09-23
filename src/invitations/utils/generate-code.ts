/**
 * Genera un código único de invitación.
 * Formato: JSP-XXXX-XXXX
 * Sin caracteres confusos (I, O, 0, 1) para facilitar transcripción manual.
 */
export function generateInvitationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin I, O, 0, 1
  
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  
  return `JSP-${segment()}-${segment()}`
}