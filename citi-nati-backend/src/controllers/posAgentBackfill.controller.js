const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
exports.backfillSales = async (req, res) => {
  try {
    const payload = req.body || {};
    const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
    const metadata = payload.metadata || {};

    if (!Array.isArray(invoices)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: ['invoices must be an array'],
      });
    }

    console.log('[SALES BACKFILL] Starting batch processing', {
      invoiceCount: invoices.length,
      branchCode: metadata.branchCode,
      syncSourceCode: metadata.syncSourceCode,
      backfillMode: metadata.backfillMode,
    });

    let synced = 0;
    let skipped = 0;
    const errors = [];
    const batchSize = 50; // Process in smaller batches to prevent timeouts

    // Process invoices in batches
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, i + batchSize);
      console.log(`[SALES BACKFILL] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(invoices.length / batchSize)} (${batch.length} invoices)`);

      for (const invoice of batch) {
      try {
        // Resolve syncSourceCode from invoice, metadata, or header
        const syncSourceCode = invoice.syncSourceCode || metadata.syncSourceCode || req.headers['x-sync-source-code'];
        if (!syncSourceCode) {
          errors.push(`Invoice ${invoice.invoiceNo || 'unknown'}: missing syncSourceCode`);
          skipped++;
          continue;
        }

        // Resolve branchCode from invoice, metadata, or header
        const branchCode = invoice.branchCode || metadata.branchCode || req.headers['x-branch-code'];
        if (!branchCode) {
          errors.push(`Invoice ${invoice.invoiceNo || 'unknown'}: missing branchCode`);
          skipped++;
          continue;
        }

        // Upsert sync source
        const syncSource = await prisma.salesSyncSource.upsert({
          where: { syncSourceCode },
          create: {
            branchCode,
            branchName: invoice.branchName || branchCode,
            locationId: metadata.locationId || null,
            syncSourceCode,
            lastSeenAt: new Date(),
          },
          update: {
            branchCode,
            branchName: invoice.branchName || branchCode,
            locationId: metadata.locationId || null,
            lastSeenAt: new Date(),
          },
        });

        // Process invoice in transaction
        const result = await prisma.$transaction(async (tx) => {
          // Prepare invoice data
          const invoiceData = {
            syncSourceId: syncSource.id,
            syncSourceCode,
            sourceInvoiceNo: Number(invoice.invoiceNo) || null,
            sourceInvoiceSerialNo: Number(invoice.invoiceSerialNo) || null,
            sourceCashSaleNo: Number(invoice.cashSaleNo) || null,
            refNo: invoice.refNo || null,
            branchCode,
            branchName: invoice.branchName || branchCode,
            locationCode: invoice.locationCode || null,
            invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : null,
            invoiceTime: invoice.invoiceTime ? new Date(invoice.invoiceTime) : null,
            customerCode: invoice.customerCode || null,
            customerDetails: invoice.customerDetails || null,
            grossSale: Number(invoice.grossSale) || 0,
            vatAmount: Number(invoice.vat) || 0,
            discount: Number(invoice.discount) || 0,
            netSale: Number(invoice.netSale) || 0,
            invoiceType: invoice.invoiceType || null,
            tillId: Number(invoice.tillID) || null,
            payMethod1: invoice.payMethod1 || null,
            tenderAmount1: Number(invoice.tenAmt1) || null,
            chqNo1: invoice.chqNo1 || null,
            payMethod2: invoice.payMethod2 || null,
            tenderAmount2: Number(invoice.tenAmt2) || null,
            chqNo2: invoice.chqNo2 || null,
            userName: invoice.userName || null,
            priceTypeCode: invoice.priceTypeCode || null,
            repCode: invoice.repCode || null,
            uploadStatus: Number(invoice.uploadStatus) || null,
            levyAmount: Number(invoice.levyAmount) || 0,
            reserved: Number(invoice.reserved) || null,
            discountAmount: Number(invoice.discountAmount) || 0,
            fiscalReceiptNo: invoice.fiscalReceiptNo || null,
            bankCode: invoice.bankCode || null,
            bankName: invoice.bankName || null,
            bankCardHolder: invoice.bankCardHolder || null,
            bankCardNo: invoice.bankCardNo || null,
            bankCardExpiry: invoice.bankCardExpiary || invoice.bankCardExpiry || null,
            quoteNo: invoice.quoteNo || null,
            sourceSyncedAt: new Date(),
            lastReceivedAt: new Date(),
          };

          // Upsert invoice
          const existingInvoice = await tx.salesInvoice.findFirst({
            where: {
              syncSourceCode,
              sourceInvoiceNo: invoiceData.sourceInvoiceNo,
              locationCode: invoiceData.locationCode,
            },
          });

          let salesInvoice;
          if (existingInvoice) {
            salesInvoice = await tx.salesInvoice.update({
              where: { id: existingInvoice.id },
              data: invoiceData,
            });
          } else {
            salesInvoice = await tx.salesInvoice.create({
              data: {
                ...invoiceData,
                firstReceivedAt: new Date(),
              },
            });
          }

          // Handle items
          if (invoice.details && Array.isArray(invoice.details)) {
            // Upsert items individually to maintain data integrity
            for (const item of invoice.details) {
              if (!item.invDetailID) continue; // Skip items without invDetailID

              const itemData = {
                salesInvoiceId: salesInvoice.id,
                syncSourceCode,
                sourceInvDetailId: Number(item.invDetailID),
                sourceInvoiceCode: Number(item.invoiceCode || invoice.invoiceCode) || null,
                productCode: item.productCode || null,
                productName: item.productName || null,
                qty: Number(item.qty) || 0,
                priceTypeCode: item.priceTypeCode || null,
                unitPrice: Number(item.unitPrice) || null,
                bulkPrice: Number(item.bulkPrice) || null,
                discount: Number(item.discount) || 0,
                amount: Number(item.amount) || 0,
                startSerialNo: item.startSerialNo || null,
                endSerialNo: item.endSerialNo || null,
                taxRate: Number(item.taxRate) || 0,
                taxAmount: Number(item.taxAmount) || 0,
                fPrice: Number(item.fPrice) || null,
                uploadStatus: Number(item.uploadStatus) || null,
                locationCode: item.locationCode || null,
                levyRate: Number(item.levyRate) || 0,
                levyAmount: Number(item.levyAmount) || 0,
                printed: Number(item.printed) || null,
                subQty: Number(item.subQty) || 0,
                discountAmount: Number(item.discountAmount) || 0,
                costPrice: Number(item.costPrice) || null,
                grnDate: item.grnDate ? new Date(item.grnDate) : null,
                lastReceivedAt: new Date(),
              };

              await tx.salesInvoiceItem.upsert({
                where: {
                  syncSourceCode_sourceInvDetailId: {
                    syncSourceCode,
                    sourceInvDetailId: Number(item.invDetailID),
                  },
                },
                create: {
                  ...itemData,
                  firstReceivedAt: new Date(),
                },
                update: itemData,
              });
            }
          }

          return salesInvoice;
        });

        synced++;
      } catch (invoiceError) {
        console.error(`[BACKFILL ERROR] Invoice ${invoice.invoiceNo || 'unknown'}:`, invoiceError.message);
        errors.push(`Invoice ${invoice.invoiceNo || 'unknown'}: ${invoiceError.message}`);
        skipped++;
      }
    }
    }

    console.log('[SALES BACKFILL] Batch processing completed', {
      totalInvoices: invoices.length,
      synced,
      skipped,
      errors: errors.length,
    });

    return res.json({
      success: true,
      synced,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('[BACKFILL FATAL]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process backfill batch',
      details: error.message,
    });
  }
};
