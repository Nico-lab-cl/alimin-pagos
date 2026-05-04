import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface ReceiptData {
  clientName: string;
  rut: string;
  email: string;
  projectName: string;
  lotNumber: string;
  stage: string;
  concept: string;
  amount: number;
  date: Date;
  receiptId: string;
}

export async function generateReceiptPDF(data: ReceiptData): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const primaryColor = rgb(0.1, 0.37, 0.16); // Deep Green (#1A5F2A approx)
  const accentColor = rgb(0.83, 0.66, 0.29); // Gold (#D4A84B approx)
  const textColor = rgb(0.2, 0.2, 0.2);
  const lightGray = rgb(0.95, 0.95, 0.95);

  // Header Background
  page.drawRectangle({
    x: 0,
    y: height - 120,
    width: width,
    height: 120,
    color: primaryColor,
  });

  // Header Title
  page.drawText('COMPROBANTE DE PAGO DIGITAL', {
    x: 50,
    y: height - 60,
    size: 24,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`ALIMIN SPA - GESTIÓN INMOBILIARIA`, {
    x: 50,
    y: height - 85,
    size: 10,
    font: helveticaFont,
    color: accentColor,
  });

  // Info Box
  page.drawRectangle({
    x: 50,
    y: height - 380,
    width: width - 100,
    height: 220,
    color: lightGray,
    borderColor: accentColor,
    borderWidth: 1,
  });

  let yOffset = height - 190;
  const lineSpacing = 25;
  const col1X = 70;
  const col2X = 200;

  const drawRow = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), {
      x: col1X,
      y: yOffset,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    });
    page.drawText(value, {
      x: col2X,
      y: yOffset,
      size: 10,
      font: helveticaFont,
      color: textColor,
    });
    yOffset -= lineSpacing;
  };

  drawRow('ID Comprobante:', data.receiptId);
  drawRow('Fecha de Emisión:', data.date.toLocaleDateString('es-CL'));
  drawRow('Nombre / Razón Social:', data.clientName);
  drawRow('RUT:', data.rut);
  drawRow('Correo Electrónico:', data.email);
  drawRow('Proyecto:', data.projectName);
  drawRow('N° de Lote:', data.lotNumber);
  drawRow('Etapa:', data.stage || 'N/A');

  // Amount & Concept Box
  page.drawRectangle({
    x: 50,
    y: yOffset - 40,
    width: width - 100,
    height: 80,
    color: primaryColor,
  });

  page.drawText('CONCEPTO DE PAGO:', {
    x: 70,
    y: yOffset - 10,
    size: 10,
    font: helveticaBold,
    color: accentColor,
  });

  page.drawText(data.concept.toUpperCase(), {
    x: 70,
    y: yOffset - 25,
    size: 14,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('TOTAL PAGADO:', {
    x: width - 200,
    y: yOffset - 10,
    size: 10,
    font: helveticaBold,
    color: accentColor,
  });

  const formattedAmount = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(data.amount);
  page.drawText(formattedAmount, {
    x: width - 200,
    y: yOffset - 25,
    size: 18,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // Footer
  page.drawText('Este documento es un comprobante digital generado automáticamente y acredita la recepción del pago.', {
    x: 50,
    y: 100,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  // Return base64 string
  return Buffer.from(pdfBytes).toString('base64');
}
