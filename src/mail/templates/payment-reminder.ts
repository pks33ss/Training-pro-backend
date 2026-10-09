import { renderLayout, escapeHtml } from './layout';

export interface PaymentReminderTemplateData {
  recipientName: string;      // "Juan Pérez"
  conceptName: string;        // "Cuota octubre 2026"
  teamName?: string;
  clubName?: string;
  amountOwed: number;         // 30
  amountPaid: number;         // 0
  amountRemaining: number;    // 30
  dueDate: Date;
  daysUntilDue: number;       // -3 = vencido hace 3 días, 0 = hoy, 3 = quedan 3 días
  season?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function renderPaymentReminderEmail(
  data: PaymentReminderTemplateData,
): {
  subject: string;
  html: string;
  text: string;
} {
  const overdue = data.daysUntilDue < 0;
  const dueToday = data.daysUntilDue === 0;
  const remainingDays = Math.abs(data.daysUntilDue);

  const subject = overdue
    ? `⚠️ Recordatorio: cuota vencida · ${data.conceptName}`
    : dueToday
      ? `⏰ Vence hoy: ${data.conceptName}`
      : `⏰ Recordatorio: ${data.conceptName} vence en ${remainingDays} día${remainingDays === 1 ? '' : 's'}`;

  const introText = overdue
    ? `Tu cuota <strong>${escapeHtml(data.conceptName)}</strong> venció hace ${remainingDays} día${remainingDays === 1 ? '' : 's'}.`
    : dueToday
      ? `Tu cuota <strong>${escapeHtml(data.conceptName)}</strong> vence <strong>hoy</strong>.`
      : `Tu cuota <strong>${escapeHtml(data.conceptName)}</strong> vence en ${remainingDays} día${remainingDays === 1 ? '' : 's'}.`;

  // ─── HTML ───
  const contentHtml = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0A0A0A;">
      ${overdue ? 'Cuota pendiente de pago' : 'Recordatorio de pago'}
    </h2>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Hola <strong>${escapeHtml(data.recipientName)}</strong>,
    </p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      ${introText}${
        data.teamName ? ` del equipo <strong>${escapeHtml(data.teamName)}</strong>` : ''
      }${data.clubName ? ` (${escapeHtml(data.clubName)})` : ''}
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0 0 4px;font-size:14px;color:#92400e;">
            <strong>Importe pendiente:</strong> ${formatCurrency(data.amountRemaining)}
          </p>
          <p style="margin:0;font-size:13px;color:#92400e;">
            Vencimiento: ${formatDate(data.dueDate)}
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Si ya has realizado el pago, puedes ignorar este mensaje. Si tienes cualquier duda, contacta con tu club.
    </p>

    <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
      Este es un recordatorio automático. Por favor, no respondas a este email.
    </p>
  `;

  const html = renderLayout({
    title: subject,
    preheader: `${data.conceptName}: ${formatCurrency(data.amountRemaining)} pendiente`,
    contentHtml,
  });

  // ─── Texto plano ───
  const textIntro = overdue
    ? `Tu cuota "${data.conceptName}" venció hace ${remainingDays} día${remainingDays === 1 ? '' : 's'}.`
    : dueToday
      ? `Tu cuota "${data.conceptName}" vence HOY.`
      : `Tu cuota "${data.conceptName}" vence en ${remainingDays} día${remainingDays === 1 ? '' : 's'}.`;

  const text = [
    overdue ? 'Cuota pendiente de pago' : 'Recordatorio de pago',
    ``,
    `Hola ${data.recipientName},`,
    ``,
    textIntro +
      (data.teamName ? ` del equipo "${data.teamName}"` : '') +
      (data.clubName ? ` (${data.clubName})` : ''),
    ``,
    `Importe pendiente: ${formatCurrency(data.amountRemaining)}`,
    `Vencimiento: ${formatDate(data.dueDate)}`,
    ``,
    `Si ya has realizado el pago, puedes ignorar este mensaje.`,
    ``,
    `—`,
    `Join Sport Management`,
  ].join('\n');

  return { subject, html, text };
}