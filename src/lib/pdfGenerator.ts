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
  const helveticaItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Colors
  const primaryColor = rgb(0.1, 0.37, 0.16); // Deep Green
  const accentColor = rgb(0.83, 0.66, 0.29); // Gold
  const textColor = rgb(0.15, 0.15, 0.15);
  const mutedTextColor = rgb(0.4, 0.4, 0.4);
  const borderColor = rgb(0.8, 0.8, 0.8);
  const lightBg = rgb(0.98, 0.98, 0.98);

  // --- Main Page Border ---
  page.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderColor: accentColor,
    borderWidth: 1.5,
  });

  // --- Header Section ---
  // Logo placeholder text / Company Name
  page.drawText('ALIMIN', {
    x: 50,
    y: height - 80,
    size: 32,
    font: helveticaBold,
    color: primaryColor,
  });
  page.drawText('GESTIÓN INMOBILIARIA', {
    x: 50,
    y: height - 95,
    size: 8,
    font: helveticaBold,
    color: accentColor,
  });

  // Folio Box
  const folioWidth = 140;
  const folioHeight = 60;
  page.drawRectangle({
    x: width - 50 - folioWidth,
    y: height - 100,
    width: folioWidth,
    height: folioHeight,
    borderColor: primaryColor,
    borderWidth: 2,
  });
  page.drawText('FOLIO / ID', {
    x: width - 45 - folioWidth,
    y: height - 60,
    size: 10,
    font: helveticaBold,
    color: primaryColor,
  });
  page.drawText(`#${data.receiptId}`, {
    x: width - 45 - folioWidth,
    y: height - 85,
    size: 18,
    font: helveticaBold,
    color: accentColor,
  });

  // Title
  page.drawText('COMPROBANTE DE INGRESO DIGITAL', {
    x: 50,
    y: height - 150,
    size: 20,
    font: helveticaBold,
    color: textColor,
  });
  page.drawRectangle({
    x: 50,
    y: height - 155,
    width: 250,
    height: 3,
    color: accentColor,
  });

  // --- Content Section ---
  let yPos = height - 200;
  const marginX = 50;
  const colWidth = (width - 100) / 2;

  const drawSectionTitle = (title: string, y: number) => {
    page.drawText(title, {
      x: marginX,
      y: y,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    });
    page.drawLine({
      start: { x: marginX, y: y - 5 },
      end: { x: width - marginX, y: y - 5 },
      thickness: 1,
      color: borderColor,
    });
  };

  const drawField = (label: string, value: string, x: number, y: number) => {
    page.drawText(label.toUpperCase(), {
      x: x,
      y: y,
      size: 8,
      font: helveticaBold,
      color: mutedTextColor,
    });
    page.drawText(value || '---', {
      x: x,
      y: y - 15,
      size: 11,
      font: helveticaFont,
      color: textColor,
    });
  };

  // Section: Identificación del Cliente
  drawSectionTitle('1. IDENTIFICACIÓN DEL CLIENTE', yPos);
  yPos -= 35;
  drawField('Nombre / Razón Social', data.clientName, marginX, yPos);
  drawField('RUT / Identificación', data.rut, marginX + colWidth, yPos);
  yPos -= 40;
  drawField('Correo Electrónico', data.email, marginX, yPos);
  drawField('Fecha de Emisión', data.date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }), marginX + colWidth, yPos);

  yPos -= 60;

  // Section: Detalles de la Propiedad
  drawSectionTitle('2. DETALLES DE LA PROPIEDAD', yPos);
  yPos -= 35;
  drawField('Proyecto Inmobiliario', data.projectName, marginX, yPos);
  drawField('Lote / Parcela', data.lotNumber, marginX + colWidth, yPos);
  yPos -= 40;
  drawField('Etapa / Fase', data.stage || 'Única', marginX, yPos);

  yPos -= 60;

  // Section: Resumen del Pago
  drawSectionTitle('3. RESUMEN DEL PAGO', yPos);
  yPos -= 35;
  
  // Amount Highlight Box
  page.drawRectangle({
    x: marginX,
    y: yPos - 100,
    width: width - 100,
    height: 100,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 0.5,
  });

  const formattedAmount = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(data.amount);
  
  page.drawText('CONCEPTO:', { x: marginX + 20, y: yPos - 25, size: 9, font: helveticaBold, color: mutedTextColor });
  page.drawText(data.concept.toUpperCase(), { x: marginX + 20, y: yPos - 45, size: 14, font: helveticaBold, color: primaryColor });

  page.drawText('TOTAL RECIBIDO:', { x: marginX + 20, y: yPos - 70, size: 9, font: helveticaBold, color: mutedTextColor });
  page.drawText(formattedAmount, { x: marginX + 20, y: yPos - 90, size: 24, font: helveticaBold, color: accentColor });

  // --- Signature / Stamp Area ---
  const stampX = width - 180;
  const stampY = 120;
  
  // Simulated Stamp
  page.drawCircle({
    x: stampX + 50,
    y: stampY + 50,
    size: 45,
    borderColor: primaryColor,
    borderWidth: 2,
    opacity: 0.5,
  });
  page.drawText('PAGADO', {
    x: stampX + 25,
    y: stampY + 45,
    size: 16,
    font: helveticaBold,
    color: primaryColor,
    opacity: 0.5,
    rotate: { type: 'degrees', angle: 15 } as any,
  });
  page.drawText('ALIMIN SPA', {
    x: stampX + 28,
    y: stampY + 30,
    size: 8,
    font: helveticaBold,
    color: primaryColor,
    opacity: 0.5,
    rotate: { type: 'degrees', angle: 15 } as any,
  });

  // Footer
  const footerY = 60;
  page.drawText('Este documento es un comprobante digital generado automáticamente por el sistema de gestión de Alimin SPA.', {
    x: marginX,
    y: footerY + 15,
    size: 7,
    font: helveticaItalic,
    color: mutedTextColor,
  });
  page.drawText('Cualquier adulteración de este documento anula su validez legal.', {
    x: marginX,
    y: footerY + 5,
    size: 7,
    font: helveticaItalic,
    color: mutedTextColor,
  });

  page.drawText('www.aliminspa.cl', {
    x: width - marginX - 80,
    y: footerY + 5,
    size: 8,
    font: helveticaBold,
    color: primaryColor,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

