/**
 * Layout base para todos los emails HTML.
 * Los estilos son inline porque muchos clientes de email no soportan <style>.
 */
export function renderLayout(params: {
  title: string;
  contentHtml: string;
  preheader?: string;
}): string {
  const { title, contentHtml, preheader } = params;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>`
      : ''
  }

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- Contenedor principal -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

          <!-- Cabecera -->
          <tr>
            <td style="background-color:#00E676;padding:24px 32px;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#0A0A0A;letter-spacing:-0.2px;">
                Join Sport Management
              </h1>
            </td>
          </tr>

          <!-- Contenido -->
          <tr>
            <td style="padding:32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
                Este correo ha sido enviado automáticamente desde Join Sport Management.
                Si no esperabas este mensaje, puedes ignorarlo.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer exterior -->
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
          © ${new Date().getFullYear()} Join Sport Management
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Escapa caracteres HTML para evitar inyecciones al insertar datos del usuario.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}