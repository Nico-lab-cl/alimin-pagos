import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getInstallmentDueDate, getNominalInstallmentAmount } from "@/lib/financials";
import { getReceiptLegalInfo } from "@/lib/receiptLegalInfo";
import { PaymentReceiptPDF } from "@/components/pdf/PaymentReceiptPDF";

const OFFICIAL_RECEIPT_PREFIX = "official-";
const OFFICIAL_INSTALLMENT_PREFIX = "official-cuota-";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "true";

  // Recibo OFICIAL de una cuota que YA ESTA PAGADA pero que no tiene ningun
  // PaymentReceipt detras (pago manual registrado sin adjuntar archivo, cuota
  // sumada a mano, historial migrado). El recibo lo emite Alimin, asi que no
  // tiene por que depender de que el cliente haya subido su transferencia: se
  // genera al vuelo desde la reserva, con el monto nominal y el vencimiento de
  // esa cuota. Id: "official-cuota-{reservationId}-{numeroDeCuota}".
  if (id.startsWith(OFFICIAL_INSTALLMENT_PREFIX)) {
    try {
      const resto = id.slice(OFFICIAL_INSTALLMENT_PREFIX.length);
      const corte = resto.lastIndexOf("-");
      const reservationId = corte > 0 ? resto.slice(0, corte) : "";
      const installmentNumber = corte > 0 ? parseInt(resto.slice(corte + 1), 10) : NaN;

      if (!reservationId || !Number.isFinite(installmentNumber) || installmentNumber < 1) {
        return new NextResponse("Document not found", { status: 404 });
      }

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { lot: true, project: true },
      });
      if (!reservation) return new NextResponse("Document not found", { status: 404 });

      const user = session.user as any;
      if (user.role !== "ADMIN" && user.role !== "LEGAL") {
        if (reservation.user_id !== user.id) {
          return new NextResponse("Forbidden", { status: 403 });
        }
      }

      // Solo se emite recibo de cuotas efectivamente pagadas: nunca de una
      // cuota que el cliente todavia debe.
      if (installmentNumber > (reservation.installments_paid || 0)) {
        return new NextResponse("Document not found", { status: 404 });
      }

      const startDate =
        reservation.installment_start_date || reservation.created_at || new Date();
      const dueDay = reservation.due_day || undefined;
      const installmentDueDate = getInstallmentDueDate(startDate, installmentNumber, dueDay);
      const amount = getNominalInstallmentAmount(
        reservation.installment_ranges,
        installmentNumber,
        reservation.lot.valor_cuota || 0
      );

      const stream = await renderToStream(
        <PaymentReceiptPDF
          // El Nº del recibo se arma con el primer bloque del id, asi que se le
          // pega el numero de cuota para que no salgan dos recibos con el mismo
          // numero para la misma reserva.
          receiptId={`${reservation.id.slice(0, 8)}C${installmentNumber}`}
          receiptDate={installmentDueDate}
          hideStampTime
          clientName={`${reservation.name} ${reservation.last_name || ""}`.trim()}
          clientRut={reservation.rut || ""}
          clientEmail={reservation.email}
          projectName={reservation.project.name}
          legalInfo={getReceiptLegalInfo(reservation.project.slug)}
          lotNumber={reservation.lot.number}
          lotStage={reservation.lot.stage || ""}
          amountPaid={amount}
          paymentScope="INSTALLMENT"
          installmentsCount={1}
          totalInstallments={reservation.lot.cuotas || 0}
          nominalInstallmentNumber={installmentNumber}
          nominalInstallmentRange={null}
          installmentDueDate={installmentDueDate}
        />
      );

      const dispositionMode = forceDownload ? "attachment" : "inline";
      return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${dispositionMode}; filename="Recibo_Oficial_Cuota_${installmentNumber}_Lote_${reservation.lot.number}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Error generating official installment receipt PDF:", error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }

  // Recibo OFICIAL emitido por Alimin (distinto del comprobante que sube el
  // cliente): se genera al vuelo desde los datos del PaymentReceipt, no hay
  // archivo guardado. Se identifica con el prefijo "official-" sobre el id
  // real del PaymentReceipt.
  if (id.startsWith(OFFICIAL_RECEIPT_PREFIX)) {
    const receiptId = id.slice(OFFICIAL_RECEIPT_PREFIX.length);
    try {
      const receipt = await prisma.paymentReceipt.findUnique({
        where: { id: receiptId },
        include: { reservation: { include: { lot: true, project: true } }, lot: true },
      });
      if (!receipt) return new NextResponse("Document not found", { status: 404 });

      const user = session.user as any;
      if (user.role !== "ADMIN" && user.role !== "LEGAL") {
        if (receipt.reservation.user_id !== user.id) {
          return new NextResponse("Forbidden", { status: 403 });
        }
      }

      const receiptDate = receipt.processed_at || receipt.created_at || new Date();
      const startDate = receipt.reservation.installment_start_date || receipt.reservation.created_at || new Date();
      const dueDay = receipt.reservation.due_day || undefined;

      let installmentDueDate: Date | undefined;
      let installmentBreakdown: { number: number; dueDate: Date; amount: number }[] | undefined;
      if (receipt.scope === "INSTALLMENT" && receipt.installments_count) {
        let effectiveInstallmentNum = receipt.nominal_installment_number || receipt.installments_count || 1;
        const rangeMatch = receipt.nominal_installment_range?.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) effectiveInstallmentNum = parseInt(rangeMatch[2], 10);

        installmentDueDate = getInstallmentDueDate(startDate, effectiveInstallmentNum, dueDay);

        if (rangeMatch) {
          const rangeStart = parseInt(rangeMatch[1], 10);
          const rangeEnd = parseInt(rangeMatch[2], 10);
          const count = rangeEnd - rangeStart + 1;
          const baseAmount = Math.floor(receipt.amount_clp / count);
          installmentBreakdown = [];
          for (let n = rangeStart; n <= rangeEnd; n++) {
            installmentBreakdown.push({
              number: n,
              dueDate: getInstallmentDueDate(startDate, n, dueDay),
              amount: n === rangeEnd ? receipt.amount_clp - baseAmount * (count - 1) : baseAmount,
            });
          }
        }
      }

      const stream = await renderToStream(
        <PaymentReceiptPDF
          receiptId={receipt.id}
          receiptDate={receiptDate}
          clientName={`${receipt.reservation.name} ${receipt.reservation.last_name || ""}`.trim()}
          clientRut={receipt.reservation.rut || ""}
          clientEmail={receipt.reservation.email}
          projectName={receipt.reservation.project.name}
          legalInfo={getReceiptLegalInfo(receipt.reservation.project.slug)}
          lotNumber={receipt.lot.number}
          lotStage={receipt.lot.stage || ""}
          amountPaid={receipt.amount_clp}
          paymentScope={receipt.scope}
          installmentsCount={receipt.installments_count || 0}
          totalInstallments={receipt.lot.cuotas || 0}
          nominalInstallmentNumber={receipt.nominal_installment_number}
          nominalInstallmentRange={receipt.nominal_installment_range}
          installmentDueDate={installmentDueDate}
          installmentBreakdown={installmentBreakdown}
        />
      );

      const dispositionMode = forceDownload ? "attachment" : "inline";
      return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${dispositionMode}; filename="Recibo_Oficial_Lote_${receipt.lot.number}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Error generating official receipt PDF:", error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }

  try {
    let documentName = "";
    let base64Content = "";
    let fileTypeField: string | null = null;
    let reservationId = "";

    const document = await prisma.reservationDocument.findUnique({
      where: { id },
    });

    if (document) {
      documentName = document.name;
      base64Content = document.base64_content;
      fileTypeField = document.file_type;
      reservationId = document.reservation_id;
    } else {
      // Check if this is a payment receipt
      const receipt = await prisma.paymentReceipt.findUnique({
        where: { id },
      });
      if (receipt) {
        let ext = "pdf";
        let fileType = "application/pdf";
        if (receipt.receipt_url && receipt.receipt_url.startsWith("data:")) {
          const parts = receipt.receipt_url.split(";");
          if (parts[0]) {
            fileType = parts[0].substring(5);
            if (fileType === "image/png") ext = "png";
            else if (fileType === "image/jpeg") ext = "jpg";
            else if (fileType === "image/webp") ext = "webp";
            else if (fileType === "application/pdf") ext = "pdf";
          }
        }

        let docName = "Comprobante de Pago";
        if (receipt.scope === "PIE") {
          docName = `Comprobante_Pago_Pie.${ext}`;
        } else {
          docName = receipt.nominal_installment_range
            ? `Comprobante_Pago_Cuotas_${receipt.nominal_installment_range}.${ext}`
            : receipt.nominal_installment_number
              ? `Comprobante_Pago_Cuota_${receipt.nominal_installment_number}.${ext}`
              : `Comprobante_Pago_Cuota.${ext}`;
        }

        documentName = docName;
        base64Content = receipt.receipt_url;
        fileTypeField = fileType;
        reservationId = receipt.reservation_id;
      } else {
        // Check if this is a legacy document request
        const nameParam = url.searchParams.get("name");
        if (nameParam) {
          const reservation = await prisma.reservation.findUnique({
            where: { id },
            select: { id: true, user_id: true, manual_documents: true }
          });
          if (reservation && reservation.manual_documents) {
            const docs = Array.isArray(reservation.manual_documents)
              ? reservation.manual_documents
              : JSON.parse(reservation.manual_documents as string);
            const legacyDoc = docs.find((d: any) => d.name === nameParam);
            if (legacyDoc) {
              documentName = legacyDoc.name;
              base64Content = legacyDoc.base64 || legacyDoc.content || legacyDoc.base64_content || (legacyDoc.url?.startsWith("data:") ? legacyDoc.url : "");
              fileTypeField = legacyDoc.fileType || legacyDoc.file_type || null;
              reservationId = reservation.id;
            }
          }
        }
      }
    }

    if (!base64Content) {
      return new NextResponse("Document not found", { status: 404 });
    }

    // Check if user is either ADMIN, LEGAL or the OWNER of the reservation
    const user = session.user as any;
    if (user.role !== "ADMIN" && user.role !== "LEGAL") {
        const reservation = await prisma.reservation.findUnique({
            where: { id: reservationId },
            select: { user_id: true }
        });
        if (!reservation || reservation.user_id !== user.id) {
            return new NextResponse("Forbidden", { status: 403 });
        }
    }

    // Convert base64 to Buffer
    const base64Data = base64Content.includes(",")
        ? base64Content.split(",")[1]
        : base64Content;
    const buffer = Buffer.from(base64Data, 'base64');

    // DETECCIÓN ROBUSTA DE TIPO DE ARCHIVO (Nombre primero, luego Magic Numbers)
    let contentType = "application/octet-stream";
    let detectedExtension = "";

    const nameLower = documentName.toLowerCase();
    if (nameLower.endsWith(".pdf")) {
        contentType = "application/pdf";
        detectedExtension = "pdf";
    } else if (nameLower.endsWith(".png")) {
        contentType = "image/png";
        detectedExtension = "png";
    } else if (nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg")) {
        contentType = "image/jpeg";
        detectedExtension = "jpg";
    } else if (nameLower.endsWith(".webp")) {
        contentType = "image/webp";
        detectedExtension = "webp";
    } else if (nameLower.endsWith(".docx")) {
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        detectedExtension = "docx";
    } else if (nameLower.endsWith(".xlsx")) {
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        detectedExtension = "xlsx";
    } else {
        // Fallback: Magic Numbers
        const header = buffer.subarray(0, 8).toString('hex');
        if (header.startsWith("25504446")) {
            contentType = "application/pdf";
            detectedExtension = "pdf";
        } else if (header.startsWith("89504e47")) {
            contentType = "image/png";
            detectedExtension = "png";
        } else if (header.startsWith("ffd8ff")) {
            contentType = "image/jpeg";
            detectedExtension = "jpg";
        } else if (header.startsWith("52494646")) {
            contentType = "image/webp";
            detectedExtension = "webp";
        } else if (header.startsWith("504b0304")) {
            contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            detectedExtension = "docx";
        }
    }

    if (fileTypeField && contentType === "application/octet-stream") {
        contentType = fileTypeField;
    }

    // Asegurar que el nombre tenga la extensión correcta para que Windows/Android lo reconozcan
    let filename = documentName;
    if (detectedExtension && !filename.toLowerCase().endsWith(`.${detectedExtension}`)) {
        filename = `${filename}.${detectedExtension}`;
    }

    // Normalizar el nombre del archivo para la sección estándar de filename del encabezado
    // (removiendo caracteres no-ASCII para prevenir errores de Node/HTTP)
    const asciiFilename = filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remover tildes/acentos
      .replace(/[^\x20-\x7E]/g, "") // quitar no-ASCII
      .replace(/"/g, '\\"'); // escapar comillas dobles

    const dispositionMode = forceDownload ? "attachment" : "inline";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionMode}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
