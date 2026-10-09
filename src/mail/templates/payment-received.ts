import { renderLayout, escapeHtml } from './layout';

export interface PaymentReceivedTemplateData {
  recipientName: string;      // "Juan Pérez"
  conceptName: string;        // "Cuota octubre 2026"
  teamName?: string;          // "Cadete ROJO"
  clubName?: string;          // "CBSF"
  amount: number;             // 30
  amountPaid: number;         // 30
  amountRemaining: number;    // 0
  paidAt: Date;               // fecha del pago
  method?: string | null;     // "TRANSFER" | "CASH" | ...
  notes?: string | null;
  receiptUrl?: string | null; // justificante
  season?: string;            // "2026-27"
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  BIZUM: 'Bizum',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
};

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

export function renderPaymentReceivedEmail(data: PaymentReceivedTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `✅ Pago registrado · ${data.conceptName}`;
  const methodLabel = data.method ? METHOD_LABELS[data.method] ?? data.method : null;
  const isCompleted = data.amountRemaining <= 0;

  // ─── HTML ───
  const contentHtml = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0A0A0A;">
      ${isCompleted ? '¡Cuota completada!' : 'Hemos recibido tu pago'}
    </h2>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Hola <strong>${escapeHtml(data.recipientName)}</strong>,
    </p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Hemos registrado tu pago de <strong>${escapeHtml(data.conceptName)}</strong>${
        data.teamName ? ` del equipo <strong>${escapeHtml(data.teamName)}</strong>` : ''
      }${data.clubName ? ` (${escapeHtml(data.clubName)})` : ''}.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#6b7280;">Importe pagado</td>
        <td style="padding:8px 0;font-size:14px;color:#0A0A0A;font-weight:600;text-align:right;">
          ${formatCurrency(data.amountPaid)}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;">Fecha del pago</td>
        <td style="padding:8px 0;font-size:14px;color:#0A0A0A;text-align:right;border-top:1px solid #e5e7eb;">
          ${formatDate(data.paidAt)}
        </td>
      </tr>
      ${
        methodLabel
          ? `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;">Método</td>
        <td style="padding:8px 0;font-size:14px;color:#0A0A0A;text-align:right;border-top:1px solid #e5e7eb;">
          ${escapeHtml(methodLabel)}
        </td>
      </tr>`
          : ''
      }
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;">Importe total</td>
        <td style="padding:8px 0;font-size:14px;color:#0A0A0A;text-align:right;border-top:1px solid #e5e7eb;">
          ${formatCurrency(data.amount)}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;">Pendiente</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e5e7eb;color:${
          isCompleted ? '#00E676' : '#f59e0b'
        };">
          ${isCompleted ? 'Pagado' : formatCurrency(data.amountRemaining)}
        </td>
      </tr>
    </table>

    ${
      data.notes
        ? `
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6b7280;">
      <strong>Notas:</strong> ${escapeHtml(data.notes)}
    </p>`
        : ''
    }

    ${
      data.receiptUrl
        ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" style="background-color:#f0fdf4;border:1px solid #00E676;border-radius:8px;">
          <a href="${escapeHtml(data.receiptUrl)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#166534;text-decoration:none;">
            Ver justificante
          </a>
        </td>
      </tr>
    </table>`
        : ''
    }

    <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;">
      Si crees que hay un error, contacta con tu club.
    </p>
  `;

  const html = renderLayout({
    title: subject,
    preheader: `Pago de ${formatCurrency(data.amountPaid)} registrado`,
    contentHtml,
  });

  // ─── Texto plano ───
  const text = [
    isCompleted ? '¡Cuota completada!' : 'Hemos recibido tu pago',
    ``,
    `Hola ${data.recipientName},`,
    ``,
    `Hemos registrado tu pago de "${data.conceptName}"${
      data.teamName ? ` del equipo "${data.teamName}"` : ''
    }${data.clubName ? ` (${data.clubName})` : ''}.`,
    ``,
    `Importe pagado: ${formatCurrency(data.amountPaid)}`,
    `Fecha del pago: ${formatDate(data.paidAt)}`,
    methodLabel ? `Método: ${methodLabel}` : '',
    `Importe total: ${formatCurrency(data.amount)}`,
    `Pendiente: ${isCompleted ? 'Pagado' : formatCurrency(data.amountRemaining)}`,
    data.notes ? `Notas: ${data.notes}` : '',
    ``,
    data.receiptUrl ? `Justificante: ${data.receiptUrl}` : '',
    ``,
    `—`,
    `Join Sport Management`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}