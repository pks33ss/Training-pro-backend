import { renderLayout, escapeHtml } from './layout';

export interface InvitationTemplateData {
  recipientName: string; // "Juan Pérez" o "amigo/a" si es desconocido
  teamName: string;
  clubName: string;
  role: string; // "PLAYER" | "COACH" | ...
  inviterName: string; // "María García"
  invitationLink: string;
  expiresAt: Date;
  // Opcional: logo del club para mostrar
  clubLogoUrl?: string;
}

const ROLE_LABELS: Record<string, string> = {
  PLAYER: 'Jugador',
  COACH: 'Entrenador',
  ASSISTANT: 'Entrenador asistente',
  ADMIN_TEAM: 'Administrador del equipo',
  VISITOR: 'Visitante',
};

export function renderInvitationEmail(data: InvitationTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const roleLabel = ROLE_LABELS[data.role] ?? data.role;

  const subject = `${data.inviterName} te ha invitado al equipo "${data.teamName}"`;

  // ─── HTML ───
  const contentHtml = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0A0A0A;">
      Te han invitado a un equipo
    </h2>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Hola <strong>${escapeHtml(data.recipientName)}</strong>,
    </p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      <strong>${escapeHtml(data.inviterName)}</strong> te ha invitado a formar parte del equipo
      <strong>${escapeHtml(data.teamName)}</strong>${
        data.clubName ? ` del club <strong>${escapeHtml(data.clubName)}</strong>` : ''
      }.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f0fdf4;border-left:4px solid #00E676;border-radius:4px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0;font-size:14px;color:#166534;">
            <strong>Rol asignado:</strong> ${escapeHtml(roleLabel)}
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" style="background-color:#00E676;border-radius:8px;">
          <a href="${escapeHtml(data.invitationLink)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#0A0A0A;text-decoration:none;border-radius:8px;">
            Aceptar invitación
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
      O copia y pega este enlace en tu navegador:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#00E676;word-break:break-all;">
      <a href="${escapeHtml(data.invitationLink)}" style="color:#00E676;text-decoration:underline;">
        ${escapeHtml(data.invitationLink)}
      </a>
    </p>

    <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
      Esta invitación caduca el ${formatDate(data.expiresAt)}.
    </p>
  `;

  const html = renderLayout({
    title: subject,
    preheader: `${data.inviterName} te ha invitado al equipo ${data.teamName}`,
    contentHtml,
  });

  // ─── Texto plano (fallback) ───
  const text = [
    `Te han invitado a un equipo`,
    ``,
    `Hola ${data.recipientName},`,
    ``,
    `${data.inviterName} te ha invitado a formar parte del equipo "${data.teamName}"${
      data.clubName ? ` del club "${data.clubName}"` : ''
    }.`,
    ``,
    `Rol asignado: ${roleLabel}`,
    ``,
    `Acepta la invitación en este enlace:`,
    data.invitationLink,
    ``,
    `Esta invitación caduca el ${formatDate(data.expiresAt)}.`,
    ``,
    `—`,
    `Join Sport Management`,
  ].join('\n');

  return { subject, html, text };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}