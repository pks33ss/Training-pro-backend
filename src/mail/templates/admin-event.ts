import { renderLayout, escapeHtml } from './layout'

export interface AdminEventData {
  eventTitle: string
  icon?: string
  fields: { label: string; value: string }[]
  note?: string
}

export function renderAdminEventEmail(data: AdminEventData): {
  subject: string
  html: string
  text: string
} {
  const subject = `[JoinSport] ${data.eventTitle}`

  const rowsHtml = data.fields
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">
          ${escapeHtml(f.label)}
        </td>
        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;word-break:break-word;">
          ${escapeHtml(f.value)}
        </td>
      </tr>
    `,
    )
    .join('')

  const contentHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0A0A0A;">
      ${data.icon ? data.icon + ' ' : ''}${escapeHtml(data.eventTitle)}
    </h2>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      ${rowsHtml}
    </table>

    ${
      data.note
        ? `<div style="background-color:#f9fafb;border-left:4px solid #00E676;border-radius:4px;padding:12px 16px;margin:0 0 16px;">
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
              ${escapeHtml(data.note)}
            </p>
          </div>`
        : ''
    }

    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Enviado automáticamente por JoinSport.
    </p>
  `

  const html = renderLayout({
    title: subject,
    preheader: data.eventTitle,
    contentHtml,
  })

  const text = [
    data.eventTitle,
    '',
    ...data.fields.map((f) => `${f.label}: ${f.value}`),
    ...(data.note ? ['', data.note] : []),
    '',
    '—',
    'JoinSport',
  ].join('\n')

  return { subject, html, text }
}