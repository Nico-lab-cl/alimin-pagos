import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReceiptLegalInfo } from '@/lib/receiptLegalInfo';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
    borderBottomWidth: 2,
    borderBottomColor: '#4EA898',
    paddingBottom: 20,
  },
  logo: {
    width: 80,
  },
  headerTextRight: {
    textAlign: 'right',
    color: '#4EA898',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#4EA898',
  },
  receiptNumber: {
    fontSize: 12,
    color: '#666666',
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4EA898',
    backgroundColor: '#f1f5f9',
    padding: 8,
    marginBottom: 10,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    width: '35%',
    fontSize: 11,
    color: '#666666',
    fontWeight: 'bold',
  },
  value: {
    width: '65%',
    fontSize: 11,
    color: '#000000',
  },
  tableBox: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#4EA898',
    padding: 10,
  },
  tableHeaderCellItem: {
    width: '60%',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tableHeaderCellAmount: {
    width: '40%',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableCellItem: {
    width: '60%',
    fontSize: 11,
    color: '#333333',
  },
  tableCellAmount: {
    width: '40%',
    fontSize: 11,
    textAlign: 'right',
    color: '#000000',
    fontWeight: 'bold',
  },
  totalRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  totalLabel: {
    width: '60%',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4EA898',
    textAlign: 'right',
    paddingRight: 20,
  },
  totalAmount: {
    width: '40%',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4EA898',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  footerText: {
    fontSize: 9,
    color: '#666666',
    marginBottom: 4,
  },
  stampContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  stampOval: {
    borderWidth: 2,
    borderColor: '#ef4444',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 4,
    transform: 'rotate(-5deg)',
  },
  stampText: {
    color: '#ef4444',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});

interface PaymentReceiptPDFProps {
  receiptId: string;
  receiptDate: Date;
  clientName: string;
  clientRut: string;
  clientEmail: string;
  projectName: string;
  legalInfo: ReceiptLegalInfo;
  lotNumber: string;
  lotStage: string;
  amountPaid: number;
  paymentScope: 'PIE' | 'INSTALLMENT' | string;
  installmentsCount?: number;
  totalInstallments?: number;
  installmentDueDate?: Date;
  installmentBreakdown?: { number: number; dueDate: Date; amount: number }[];
  nominalInstallmentNumber?: number | null;
  nominalInstallmentRange?: string | null;
  logoPath?: string;
}

export const PaymentReceiptPDF = ({
  receiptId,
  receiptDate,
  clientName,
  clientRut,
  clientEmail,
  projectName,
  legalInfo,
  lotNumber,
  lotStage,
  amountPaid,
  paymentScope,
  installmentsCount = 0,
  totalInstallments = 0,
  installmentDueDate,
  installmentBreakdown,
  nominalInstallmentNumber,
  nominalInstallmentRange,
  logoPath,
}: PaymentReceiptPDFProps) => {
  const isCuotas = paymentScope === 'INSTALLMENT';
  const monthYear = isCuotas && installmentDueDate
    ? ` (${format(installmentDueDate, 'MMMM yyyy', { locale: es }).toUpperCase()})`
    : '';

  let installmentLabel = '';
  if (nominalInstallmentRange) {
    installmentLabel = `Cuotas #${nominalInstallmentRange}`;
  } else if (nominalInstallmentNumber) {
    installmentLabel = `Cuota #${String(nominalInstallmentNumber).padStart(2, '0')}`;
  } else {
    installmentLabel = `Cuota #${String(installmentsCount).padStart(2, '0')}`;
  }

  const itemName = isCuotas
    ? `${installmentLabel}/${totalInstallments}${monthYear}`
    : paymentScope === 'PIE'
      ? 'Pago de Pie'
      : 'Pago de Reserva';

  const shortId = receiptId.split('-')[0].toUpperCase();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoPath ? (
            <Image src={logoPath} style={styles.logo} />
          ) : (
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#4EA898' }}>{projectName.toUpperCase()}</Text>
          )}
          <View style={styles.headerTextRight}>
            <Text style={styles.title}>COMPROBANTE DE PAGO</Text>
            <Text style={styles.receiptNumber}>Nº {shortId}</Text>
            <Text style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              Fecha Emisión: {format(new Date(), "dd 'de' MMMM, yyyy", { locale: es })}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nombre / Razón Social:</Text>
            <Text style={styles.value}>{clientName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>RUT:</Text>
            <Text style={styles.value}>{clientRut || 'No especificado'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Correo Electrónico:</Text>
            <Text style={styles.value}>{clientEmail}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del Proyecto</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Proyecto:</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Nº Parcela / Unidad:</Text>
            <Text style={styles.value}>{lotNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Polígono / Etapa:</Text>
            <Text style={styles.value}>{lotStage}</Text>
          </View>
        </View>

        <View style={styles.tableBox}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableHeaderCellItem}>CONCEPTO</Text>
            <Text style={styles.tableHeaderCellAmount}>CANTIDAD (CLP)</Text>
          </View>

          {installmentBreakdown && installmentBreakdown.length > 1 ? (
            installmentBreakdown.map((item) => (
              <View style={styles.tableRow} key={item.number}>
                <View style={{ width: '60%' }}>
                  <Text style={styles.tableCellItem}>
                    Cuota #{String(item.number).padStart(2, '0')}/{totalInstallments} - Lote {lotNumber}
                  </Text>
                  <Text style={{ fontSize: 9, color: '#666', marginTop: 4 }}>
                    Fecha de vencimiento: {format(item.dueDate, "dd 'de' MMMM, yyyy", { locale: es })}
                  </Text>
                </View>
                <Text style={styles.tableCellAmount}>
                  {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.amount)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <View style={{ width: '60%' }}>
                <Text style={styles.tableCellItem}>{itemName} - Lote {lotNumber}</Text>
                {installmentDueDate && (
                  <Text style={{ fontSize: 9, color: '#666', marginTop: 4 }}>
                    Fecha de vencimiento: {format(installmentDueDate, "dd 'de' MMMM, yyyy", { locale: es })}
                  </Text>
                )}
              </View>
              <Text style={styles.tableCellAmount}>
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amountPaid)}
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL RECIBIDO</Text>
            <Text style={styles.totalAmount}>
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amountPaid)}
            </Text>
          </View>
        </View>

        <View style={styles.stampContainer}>
          <View style={styles.stampOval}>
            <Text style={styles.stampText}>RECIBIDO / PAGADO</Text>
            <Text style={{ textAlign: 'center', fontSize: 8, color: '#ef4444', marginTop: 4 }}>
              {format(receiptDate, 'dd/MM/yyyy HH:mm', { locale: es })}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {legalInfo.legalName} - {legalInfo.rut} - {legalInfo.address}
          </Text>
          <Text style={styles.footerText}>
            Este documento es un comprobante de pago electrónico. Conserva este recibo para tus registros.
          </Text>
          <Text style={styles.footerText}>
            Para cualquier consulta, por favor contáctanos a {legalInfo.contactEmail}
          </Text>
        </View>
      </Page>
    </Document>
  );
};
