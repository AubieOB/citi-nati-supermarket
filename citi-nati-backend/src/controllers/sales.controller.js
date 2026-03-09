const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Start a new sales day
 * POST /admin/sales/start
 */
const startSalesDay = async (req, res) => {
  try {
    // Check if there's already an open sales day
    const existingOpenDay = await prisma.salesDay.findFirst({
      where: { status: 'OPEN' }
    });

    if (existingOpenDay) {
      console.log('[SALES] Sales day already open:', existingOpenDay.id);
      return res.status(400).json({
        message: 'Sales day already open',
        openedAt: existingOpenDay.openedAt,
        salesDayId: existingOpenDay.id
      });
    }

    // Create new sales day
    const newDay = await prisma.salesDay.create({
      data: {
        date: new Date(),
        status: 'OPEN',
        openedAt: new Date()
      }
    });

    console.log('[SALES] New sales day started:', { id: newDay.id, openedAt: newDay.openedAt });
    res.json({
      message: 'Sales day started',
      salesDay: newDay
    });
  } catch (err) {
    console.error('[SALES] Error starting sales day:', err);
    res.status(500).json({ message: 'Failed to start sales day', error: err.message });
  }
};

/**
 * End the current sales day
 * POST /admin/sales/end
 */
const endSalesDay = async (req, res) => {
  try {
    // Find open sales day
    const openDay = await prisma.salesDay.findFirst({
      where: { status: 'OPEN' },
      include: { orders: true }
    });

    if (!openDay) {
      return res.status(400).json({ message: 'No open sales day found' });
    }

    // Calculate totals - ONLY COUNT PAID ORDERS
    const paidOrders = openDay.orders.filter(order => order.paymentStatus === 'PAID');
    const totalSales = paidOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );
    const totalOrders = paidOrders.length;

    // Update sales day to CLOSED
    const closedDay = await prisma.salesDay.update({
      where: { id: openDay.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        totalSales,
        totalOrders
      },
      include: { orders: true }
    });

    console.log('[SALES] Sales day closed:', closedDay.id, 'Total:', totalSales);
    res.json({
      message: 'Sales day closed successfully',
      salesDay: closedDay
    });
  } catch (err) {
    console.error('[SALES] Error ending sales day:', err);
    res.status(500).json({ message: 'Failed to end sales day' });
  }
};

/**
 * Get current open sales day
 * GET /admin/sales/current
 */
const getCurrentSalesDay = async (req, res) => {
  try {
    const currentDay = await prisma.salesDay.findFirst({
      where: { status: 'OPEN' },
      include: {
        orders: {
          where: { paymentStatus: 'PAID' }
        }
      }
    });

    res.json({ salesDay: currentDay });
  } catch (err) {
    console.error('[SALES] Error fetching current sales day:', err);
    res.status(500).json({ message: 'Failed to fetch current sales day' });
  }
};

/**
 * Get sales day by ID with details
 * GET /admin/sales/:id
 */
const getSalesDayById = async (req, res) => {
  try {
    const { id } = req.params;

    const salesDay = await prisma.salesDay.findUnique({
      where: { id: parseInt(id) },
      include: {
        orders: {
          where: { paymentStatus: 'PAID' },
          include: {
            user: { select: { id: true, name: true, email: true } },
            driver: { select: { id: true, name: true, email: true } },
            items: { include: { product: true } }
          }
        }
      }
    });

    if (!salesDay) {
      return res.status(404).json({ message: 'Sales day not found' });
    }

    res.json({ salesDay });
  } catch (err) {
    console.error('[SALES] Error fetching sales day:', err);
    res.status(500).json({ message: 'Failed to fetch sales day' });
  }
};

/**
 * Get all sales day history
 * GET /admin/sales/history
 */
const getSalesDayHistory = async (req, res) => {
  try {
    const salesDays = await prisma.salesDay.findMany({
      where: { status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      include: {
        orders: {
          where: { paymentStatus: 'PAID' },
          include: {
            items: {
              include: {
                product: true
              }
            },
            driver: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            }
          }
        }
      }
    });

    res.json({ salesDays });
  } catch (err) {
    console.error('[SALES] Error fetching sales history:', err);
    res.status(500).json({ message: 'Failed to fetch sales history' });
  }
};

/**
 * Export sales day report as CSV
 * GET /admin/sales/:id/export
 */
const exportSaleDayCSV = async (req, res) => {
  try {
    const { id } = req.params;

    const salesDay = await prisma.salesDay.findUnique({
      where: { id: parseInt(id) },
      include: {
        orders: {
          where: { paymentStatus: 'PAID' },
          include: {
            user: { select: { name: true, email: true } },
            driver: { select: { name: true, email: true } },
            items: { include: { product: true } }
          }
        }
      }
    });

    if (!salesDay) {
      return res.status(404).json({ message: 'Sales day not found' });
    }

    // Flatten order data for CSV
    const csvData = salesDay.orders.map(order => ({
      'Order ID': order.id,
      'Customer': order.user.name,
      'Customer Email': order.user.email,
      'Driver': order.driver?.name || 'Not Assigned',
      'Driver Email': order.driver?.email || '',
      'Total': `MWK ${order.total.toFixed(2)}`,
      'Status': order.status,
      'Items': order.items.map(item => `${item.product.name} (x${item.quantity})`).join('; '),
      'Created': new Date(order.createdAt).toLocaleString()
    }));

    // Create CSV string
    const headers = Object.keys(csvData[0] || {});
    const csvString = [
      headers.join(','),
      ...csvData.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap if contains comma
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${id}.csv"`);
    res.send(csvString);
  } catch (err) {
    console.error('[SALES] Error exporting CSV:', err);
    res.status(500).json({ message: 'Failed to export CSV' });
  }
};

/**
 * Clear all sales history (delete all closed sales days)
 * DELETE /admin/sales/history
 */
const clearSalesHistory = async (req, res) => {
  try {
    // Delete all closed sales days
    const result = await prisma.salesDay.deleteMany({
      where: { status: 'CLOSED' }
    });

    console.log('[SALES] Sales history cleared:', { deleted: result.count });
    res.json({
      message: 'Sales history cleared successfully',
      deletedCount: result.count
    });
  } catch (err) {
    console.error('[SALES] Error clearing sales history:', err);
    res.status(500).json({ message: 'Failed to clear sales history' });
  }
};

module.exports = { startSalesDay, endSalesDay, getCurrentSalesDay, getSalesDayById, getSalesDayHistory, exportSaleDayCSV, clearSalesHistory };
