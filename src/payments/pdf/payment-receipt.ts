import PDFDocument from 'pdfkit';

// ============================================
// TIPOS
// ============================================

export interface PaymentReceiptData {
  // Club
  clubName: string;
  clubLogoUrl?: string | null;
  clubAddress?: string | null;
  clubPhone?: string | null;
  clubEmail?: string | null;

  // Concepto
  conceptName: string;
  conceptDescription?: string | null;
  conceptSeason: string;
  conceptDueDate: Date;
  conceptAmountPerPlayer: number;

  // Equipo (opcional)
  teamName?: string | null;

  // Jugador
  playerName: string;
  playerEmail?: string | null;

  // Pago concreto
  paymentId: string;
  paymentAmount: number;
  paymentPaidAt: Date;
  paymentMethod?: string | null;
  paymentNotes?: string | null;

  // Estado global del jugador en este concepto
  totalPaidByPlayer: number;
  totalRemaining: number;

  // Emitido por
  issuedAt: Date;
}

// ============================================
// HELPERS
// ============================================

const BRAND_GREEN = '#00E676';
const DARK = '#0A0A0A';
const GRAY = '#6b7280';
const LIGHT_GRAY = '#e5e7eb';
const BG_SOFT = '#f9fafb';

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
    month: '2-digit',
    year: 'numeric',
  });
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// ============================================
// GENERADOR PRINCIPAL
// ============================================

export async function generateReceiptPdf(
  data: PaymentReceiptData,
): Promise<Buffer> {
  return new Promise<Buffer>(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Recibo · ${data.conceptName}`,
          Author: data.clubName,
          Subject: 'Justificante de pago',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const marginLeft = doc.page.margins.left;
      const contentWidth = pageWidth - marginLeft * 2;

      // ─────────────────────────────────────
      // CABECERA (banda verde con logo + nombre club)
      // ─────────────────────────────────────
      const headerHeight = 70;
      doc.rect(0, 0, pageWidth, headerHeight).fill(BRAND_GREEN);

      let textStartX = marginLeft;

      if (data.clubLogoUrl) {
        const logoBuffer = await fetchImageBuffer(data.clubLogoUrl);
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, marginLeft, 15, {
              fit: [40, 40],
              valign: 'center',
            });
            textStartX = marginLeft + 50;
          } catch {
            // Si el logo falla, seguimos con el texto al inicio
          }
        }
      }

      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(data.clubName, textStartX, 22, {
          width: contentWidth - (textStartX - marginLeft),
        });

      doc
        .fillColor(DARK)
        .font('Helvetica')
        .fontSize(10)
        .text('Justificante de pago', textStartX, 45, {
          width: contentWidth - (textStartX - marginLeft),
        });

      // Resetear posición tras cabecera
      let cursorY = headerHeight + 30;

      // ─────────────────────────────────────
      // TÍTULO DEL RECIBO
      // ─────────────────────────────────────
      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('RECIBO DE PAGO', marginLeft, cursorY, {
          width: contentWidth,
          align: 'center',
        });

      cursorY += 30;

      // ─────────────────────────────────────
      // ID + FECHA DE EMISIÓN
      // ─────────────────────────────────────
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(9)
        .text(`ID: ${data.paymentId.slice(-8).toUpperCase()}`, marginLeft, cursorY, {
          width: contentWidth / 2,
        })
        .text(
          `Emitido: ${formatDate(data.issuedAt)}`,
          marginLeft + contentWidth / 2,
          cursorY,
          { width: contentWidth / 2, align: 'right' },
        );

      cursorY += 20;

      // ─────────────────────────────────────
      // DATOS DEL CLUB (bloque gris)
      // ─────────────────────────────────────
      const clubLines: string[] = [];
      if (data.clubAddress) clubLines.push(data.clubAddress);
      if (data.clubPhone) clubLines.push(`Tel: ${data.clubPhone}`);
      if (data.clubEmail) clubLines.push(data.clubEmail);

      if (clubLines.length > 0) {
        doc
          .rect(marginLeft, cursorY, contentWidth, 20 + clubLines.length * 14)
          .fill(BG_SOFT);

        doc
          .fillColor(GRAY)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('DATOS DEL CLUB', marginLeft + 10, cursorY + 6);

        doc.fillColor(DARK).font('Helvetica').fontSize(10);
        clubLines.forEach((line, i) => {
          doc.text(line, marginLeft + 10, cursorY + 20 + i * 14, {
            width: contentWidth - 20,
          });
        });

        cursorY += 20 + clubLines.length * 14 + 15;
      }

      // ─────────────────────────────────────
      // DATOS DEL JUGADOR (bloque gris)
      // ─────────────────────────────────────
      doc
        .rect(marginLeft, cursorY, contentWidth, 55)
        .fill(BG_SOFT);

      doc
        .fillColor(GRAY)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('JUGADOR', marginLeft + 10, cursorY + 6);

      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(data.playerName, marginLeft + 10, cursorY + 20, {
          width: contentWidth - 20,
        });

      if (data.playerEmail) {
        doc
          .fillColor(GRAY)
          .font('Helvetica')
          .fontSize(9)
          .text(data.playerEmail, marginLeft + 10, cursorY + 38);
      }

      cursorY += 70;

      // ─────────────────────────────────────
      // DETALLE DEL CONCEPTO
      // ─────────────────────────────────────
      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Concepto', marginLeft, cursorY);

      cursorY += 18;

      const conceptRows: Array<[string, string]> = [
        ['Nombre', data.conceptName],
        ['Temporada', data.conceptSeason],
        ['Vencimiento', formatDate(data.conceptDueDate)],
      ];
      if (data.teamName) conceptRows.push(['Equipo', data.teamName]);

      for (const [label, value] of conceptRows) {
        doc
          .fillColor(GRAY)
          .font('Helvetica')
          .fontSize(10)
          .text(label, marginLeft, cursorY, { width: 120 });
        doc
          .fillColor(DARK)
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(value, marginLeft + 120, cursorY, {
            width: contentWidth - 120,
          });
        cursorY += 16;
      }

      cursorY += 10;

      // ─────────────────────────────────────
      // DETALLE DEL PAGO (tabla)
      // ─────────────────────────────────────
      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Detalle del pago', marginLeft, cursorY);

      cursorY += 18;

      // Cabecera de la tabla
      const tableWidth = contentWidth;
      const colX = {
        concept: marginLeft + 10,
        amount: marginLeft + tableWidth - 10,
      };

      doc.rect(marginLeft, cursorY, tableWidth, 22).fill(BRAND_GREEN);

      doc
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Concepto', colX.concept, cursorY + 7)
        .text('Importe', colX.amount - 80, cursorY + 7, {
          width: 80,
          align: 'right',
        });

      cursorY += 22;

      // Fila: pago registrado
      doc
        .fillColor(DARK)
        .font('Helvetica')
        .fontSize(10)
        .text(
          `Pago recibido · ${formatDate(data.paymentPaidAt)}${
            data.paymentMethod
              ? ` · ${METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod}`
              : ''
          }`,
          colX.concept,
          cursorY + 8,
          { width: tableWidth - 100 },
        )
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .text(formatCurrency(data.paymentAmount), colX.amount - 80, cursorY + 8, {
          width: 80,
          align: 'right',
        });

      cursorY += 28;

      // Línea separadora
      doc
        .moveTo(marginLeft, cursorY)
        .lineTo(marginLeft + tableWidth, cursorY)
        .strokeColor(LIGHT_GRAY)
        .stroke();

      cursorY += 10;

      // Subtotal pagado (acumulado)
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(10)
        .text('Total pagado por el jugador', colX.concept, cursorY, {
          width: tableWidth - 100,
        })
        .fillColor(DARK)
        .font('Helvetica-Bold')
        .text(formatCurrency(data.totalPaidByPlayer), colX.amount - 80, cursorY, {
          width: 80,
          align: 'right',
        });

      cursorY += 18;

      // Importe total del concepto
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(10)
        .text('Importe total del concepto', colX.concept, cursorY, {
          width: tableWidth - 100,
        })
        .fillColor(DARK)
        .text(formatCurrency(data.conceptAmountPerPlayer), colX.amount - 80, cursorY, {
          width: 80,
          align: 'right',
        });

      cursorY += 18;

      // Pendiente (destacado)
      const pendingColor = data.totalRemaining > 0 ? '#f59e0b' : BRAND_GREEN;
      doc
        .fillColor(GRAY)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Pendiente', colX.concept, cursorY, {
          width: tableWidth - 100,
        })
        .fillColor(pendingColor)
        .font('Helvetica-Bold')
        .text(
          data.totalRemaining > 0
            ? formatCurrency(data.totalRemaining)
            : 'Pagado',
          colX.amount - 80,
          cursorY,
          { width: 80, align: 'right' },
        );

      cursorY += 28;

      // ─────────────────────────────────────
      // NOTAS
      // ─────────────────────────────────────
      if (data.paymentNotes) {
        doc
          .fillColor(GRAY)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('NOTAS', marginLeft, cursorY);

        cursorY += 14;

        doc
          .fillColor(DARK)
          .font('Helvetica')
          .fontSize(10)
          .text(data.paymentNotes, marginLeft, cursorY, {
            width: contentWidth,
          });

        cursorY = doc.y + 10;
      }

      // ─────────────────────────────────────
      // PIE DE PÁGINA
      // ─────────────────────────────────────
      const footerY = pageHeight - 60;

      doc
        .moveTo(marginLeft, footerY)
        .lineTo(marginLeft + contentWidth, footerY)
        .strokeColor(LIGHT_GRAY)
        .stroke();

      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(8)
        .text(
          'Este documento no es una factura. Es un justificante interno del pago registrado en la plataforma.',
          marginLeft,
          footerY + 8,
          { width: contentWidth, align: 'center' },
        );

      doc
        .fillColor(GRAY)
        .fontSize(7)
        .text(
          `Generado por Join Sport Management · ${formatDate(data.issuedAt)}`,
          marginLeft,
          footerY + 24,
          { width: contentWidth, align: 'center' },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}