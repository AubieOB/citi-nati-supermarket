import html2pdf from 'html2pdf.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND_PURPLE = '#5B4B8A';
const BRAND_GREEN = '#2D8659';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatProductsCurrency = (amount) => {
  const numericAmount = Number(amount || 0);
  return `MWK ${new Intl.NumberFormat('en-US').format(numericAmount)}`;
};

const buildBrandedHeader = ({
  reportTitle,
  subText = '',
  periodText = '',
  generatedText = '',
  supportText = '',
  accentColor = BRAND_PURPLE,
  compact = false,
}) => {
  const logoHeight = compact ? 44 : 58;
  const brandFontSize = compact ? 22 : 28;
  const titleFontSize = compact ? 14 : 16;
  const sideSpacer = compact ? 44 : 58;

  return `
    <div style="margin-bottom: 28px; border-bottom: 3px solid ${accentColor}; padding-bottom: 14px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${logo}" alt="Citi-Nati logo" style="height: ${logoHeight}px; width: auto; object-fit: contain; flex: 0 0 auto;" />
        <div style="flex: 1; text-align: center;">
          <h1 style="margin: 0; font-size: ${brandFontSize}px; font-weight: 700; line-height: 1.2;">
            <span style="color: ${BRAND_PURPLE};">Citi</span><span style="color: ${BRAND_GREEN};">- Nati Supermarket</span>
          </h1>
          <p style="margin: 6px 0 0 0; color: #111; font-size: ${titleFontSize}px; font-weight: 600;">${reportTitle}</p>
          ${subText ? `<p style="margin: 4px 0 0 0; color: #666; font-size: 12px;">${subText}</p>` : ''}
          ${periodText ? `<p style="margin: 4px 0 0 0; color: #666; font-size: 12px;">${periodText}</p>` : ''}
          ${generatedText ? `<p style="margin: 4px 0 0 0; color: #777; font-size: 12px;">${generatedText}</p>` : ''}
          ${supportText ? `<p style="margin: 4px 0 0 0; color: #777; font-size: 11px;">${supportText}</p>` : ''}
        </div>
        <div style="width: ${sideSpacer}px; flex: 0 0 ${sideSpacer}px;"></div>
      </div>
    </div>
  `;
};

export const generateSummaryReportPDF = (salesDays, dateRange = {}) => {
  const today = new Date().toLocaleDateString();
  const totalOrders = salesDays.reduce((sum, day) => sum + (day.totalOrders || 0), 0);
  const totalRevenue = salesDays.reduce((sum, day) => sum + (day.totalSales || 0), 0);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Sales Summary Report',
        periodText: `Period: ${dateRange.fromDate} to ${dateRange.toDate}`,
        generatedText: `Generated on ${today}`,
        accentColor: BRAND_GREEN,
      })}

      <!-- Executive Summary -->
      <div style="background-color: #f0f9f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">Executive Summary</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL SALES DAYS</p>
            <p style="margin: 0; color: #2D8659; font-size: 28px; font-weight: bold;">${salesDays.length}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL ORDERS</p>
            <p style="margin: 0; color: #5B4B8A; font-size: 28px; font-weight: bold;">${totalOrders}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL REVENUE</p>
            <p style="margin: 0; color: #FF6B6B; font-size: 28px; font-weight: bold;">MWK ${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <!-- Detailed Table -->
      <h2 style="color: #333; font-size: 18px; margin-top: 30px; margin-bottom: 15px;">Sales by Day</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="background-color: #2D8659; color: white;">
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Date</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">Orders</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; border: 1px solid #ddd;">Revenue</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${salesDays.map((day, idx) => {
            const opened = new Date(day.openedAt);
            const closed = new Date(day.closedAt);
            const duration = Math.round((closed - opened) / 1000 / 60);
            return `
              <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'}; border-bottom: 1px solid #ddd;">
                <td style="padding: 12px; border: 1px solid #ddd;">${opened.toLocaleDateString()}</td>
                <td style="padding: 12px; text-align: center; border: 1px solid #ddd; font-weight: 600;">${day.totalOrders || 0}</td>
                <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #2D8659; font-weight: 600;">MWK ${(day.totalSales || 0).toFixed(2)}</td>
                <td style="padding: 12px; text-align: center; border: 1px solid #ddd; font-size: 12px; color: #666;">${duration}m</td>
              </tr>
            `;
          }).join('')}
          <tr style="background-color: #f0f9f6; font-weight: bold; border-top: 2px solid #2D8659;">
            <td style="padding: 12px; border: 1px solid #ddd;">TOTAL</td>
            <td style="padding: 12px; text-align: center; border: 1px solid #ddd; color: #333;">${totalOrders}</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #2D8659; font-size: 16px;">MWK ${totalRevenue.toFixed(2)}</td>
            <td style="padding: 12px; text-align: center; border: 1px solid #ddd;"></td>
          </tr>
        </tbody>
      </table>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citinati.com</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `sales-summary-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateProductSalesReportPDF = (productSales, salesDays, dateRange = {}) => {
  const today = new Date().toLocaleDateString();
  const totalQuantity = productSales.reduce((sum, p) => sum + p.quantity, 0);
  const totalRevenue = productSales.reduce((sum, p) => sum + p.totalRevenue, 0);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Sales by Product Report',
        periodText: `Period: ${dateRange.fromDate} to ${dateRange.toDate}`,
        generatedText: `Generated on ${today}`,
        accentColor: BRAND_GREEN,
      })}

      <!-- Executive Summary -->
      <div style="background-color: #f0f9f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">Summary</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">PRODUCTS SOLD</p>
            <p style="margin: 0; color: #2D8659; font-size: 28px; font-weight: bold;">${productSales.length}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL UNITS</p>
            <p style="margin: 0; color: #5B4B8A; font-size: 28px; font-weight: bold;">${totalQuantity}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL REVENUE</p>
            <p style="margin: 0; color: #2D8659; font-size: 28px; font-weight: bold;">MWK ${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <!-- Product Details Table -->
      <h2 style="color: #333; font-size: 18px; margin-top: 30px; margin-bottom: 15px;">Product Sales Breakdown</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="background-color: #2D8659; color: white;">
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Product</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">Quantity</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; border: 1px solid #ddd;">Revenue</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; border: 1px solid #ddd;">% of Total</th>
          </tr>
        </thead>
        <tbody>
          ${productSales.map((product, idx) => {
            const percentage = ((product.totalRevenue / totalRevenue) * 100).toFixed(1);
            return `
              <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'}; border-bottom: 1px solid #ddd;">
                <td style="padding: 12px; border: 1px solid #ddd; font-weight: 500;">${product.name}</td>
                <td style="padding: 12px; text-align: center; border: 1px solid #ddd; font-weight: 600;">${product.quantity}</td>
                <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #2D8659; font-weight: 600;">MWK ${product.totalRevenue.toFixed(2)}</td>
                <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #666;">${percentage}%</td>
              </tr>
            `;
          }).join('')}
          <tr style="background-color: #f0f9f6; font-weight: bold; border-top: 2px solid #2D8659;">
            <td style="padding: 12px; border: 1px solid #ddd;">TOTAL</td>
            <td style="padding: 12px; text-align: center; border: 1px solid #ddd; color: #333;">${totalQuantity}</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #2D8659; font-size: 16px;">MWK ${totalRevenue.toFixed(2)}</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">100%</td>
          </tr>
        </tbody>
      </table>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citinati.com</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `sales-by-product-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateDetailedReportPDF = (salesDays, dateRange = {}) => {
  const today = new Date().toLocaleDateString();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Detailed Sales Report',
        periodText: `Period: ${dateRange.fromDate} to ${dateRange.toDate}`,
        generatedText: `Generated on ${today}`,
        accentColor: BRAND_PURPLE,
      })}

      <!-- Report Overview -->
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
        <p style="margin: 0; color: #333;"><strong>Report Period:</strong> ${dateRange.fromDate} to ${dateRange.toDate}</p>
        <p style="margin: 5px 0 0 0; color: #333;"><strong>Total Days in Report:</strong> ${salesDays.length}</p>
      </div>

      ${salesDays.map((day, idx) => {
        const opened = new Date(day.openedAt);
        const closed = new Date(day.closedAt);
        const duration = Math.round((closed - opened) / 1000 / 60);
        
        return `
          <div style="page-break-inside: avoid; margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border-left: 4px solid #5B4B8A;">
            <h3 style="margin-top: 0; color: #333; font-size: 16px;">Sales Day - ${opened.toLocaleDateString()}</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
              <div>
                <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">OPENED</p>
                <p style="margin: 5px 0 0 0; color: #333; font-weight: 600;">${opened.toLocaleTimeString()}</p>
              </div>
              <div>
                <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">CLOSED</p>
                <p style="margin: 5px 0 0 0; color: #333; font-weight: 600;">${closed.toLocaleTimeString()}</p>
              </div>
              <div>
                <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">DURATION</p>
                <p style="margin: 5px 0 0 0; color: #333; font-weight: 600;">${duration} minutes</p>
              </div>
            </div>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">TOTAL ORDERS</p>
                <p style="margin: 5px 0 0 0; color: #5B4B8A; font-size: 22px; font-weight: bold;">${day.totalOrders || 0}</p>
              </div>
              <div>
                <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">TOTAL REVENUE</p>
                <p style="margin: 5px 0 0 0; color: #2D8659; font-size: 22px; font-weight: bold;">MWK ${(day.totalSales || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        `;
      }).join('')}

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citinati.com</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `sales-detailed-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateDriverReportPDF = (drivers, dateRange = {}) => {
  const today = new Date().toLocaleDateString();
  const totalDeliveries = drivers.reduce((sum, d) => sum + (d.totalDeliveries || 0), 0);
  const totalEarnings = drivers.reduce((sum, d) => sum + (d.totalEarnings || 0), 0);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Driver Performance Report',
        generatedText: `Generated on ${today}`,
        accentColor: '#FF6B6B',
      })}

      <!-- Executive Summary -->
      <div style="background-color: #ffe6e6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">Performance Overview</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">ACTIVE DRIVERS</p>
            <p style="margin: 0; color: #FF6B6B; font-size: 28px; font-weight: bold;">${drivers.length}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL DELIVERIES</p>
            <p style="margin: 0; color: #5B4B8A; font-size: 28px; font-weight: bold;">${totalDeliveries}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL EARNINGS PAID</p>
            <p style="margin: 0; color: #2D8659; font-size: 28px; font-weight: bold;">MWK ${totalEarnings.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <!-- Driver Details -->
      <h2 style="color: #333; font-size: 18px; margin-top: 30px; margin-bottom: 15px;">Driver Performance Details</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="background-color: #FF6B6B; color: white;">
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Driver Name</th>
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Email</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">Deliveries</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; border: 1px solid #ddd;">Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${drivers.map((driver, idx) => `
            <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'}; border-bottom: 1px solid #ddd;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">${driver.name || 'N/A'}</td>
              <td style="padding: 12px; border: 1px solid #ddd; font-size: 12px; color: #666;">${driver.email || 'N/A'}</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd; font-weight: 600;">${driver.totalDeliveries || 0}</td>
              <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #FF6B6B; font-weight: 600;">MWK ${(driver.totalEarnings || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr style="background-color: #ffe6e6; font-weight: bold; border-top: 2px solid #FF6B6B;">
            <td colSpan="2" style="padding: 12px; border: 1px solid #ddd;">TOTAL</td>
            <td style="padding: 12px; text-align: center; border: 1px solid #ddd; color: #333;">${totalDeliveries}</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #FF6B6B; font-size: 16px;">MWK ${totalEarnings.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citi-nati.supermarket</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `driver-performance-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateDriverSalesReportPDF = (drivers, dateRange = {}) => {
  const today = new Date().toLocaleDateString();
  
  const totalOrders = drivers.reduce((sum, d) => sum + (d.totalDeliveries || 0), 0);
  const totalEarnings = drivers.reduce((sum, d) => sum + (d.totalEarnings || 0), 0);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Sales by Driver Report',
        periodText: `Period: ${dateRange.fromDate} to ${dateRange.toDate}`,
        generatedText: `Generated on ${today}`,
        accentColor: BRAND_PURPLE,
      })}

      <!-- Executive Summary -->
      <div style="background-color: #f5f3f9; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">Summary</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">ACTIVE DRIVERS</p>
            <p style="margin: 0; color: #5B4B8A; font-size: 28px; font-weight: bold;">${drivers.length}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL DELIVERIES</p>
            <p style="margin: 0; color: #2D8659; font-size: 28px; font-weight: bold;">${totalOrders}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 4px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #999; font-size: 12px; font-weight: bold;">TOTAL EARNINGS PAID</p>
            <p style="margin: 0; color: #5B4B8A; font-size: 28px; font-weight: bold;">MWK ${totalEarnings.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <!-- Driver Sales Details -->
      <h2 style="color: #333; font-size: 18px; margin-top: 30px; margin-bottom: 15px;">Driver Sales Performance</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="background-color: #5B4B8A; color: white;">
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Driver Name</th>
            <th style="padding: 12px; text-align: left; font-weight: bold; border: 1px solid #ddd;">Contact</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; border: 1px solid #ddd;">Deliveries</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; border: 1px solid #ddd;">Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${drivers.sort((a, b) => b.totalEarnings - a.totalEarnings).map((driver, idx) => `
            <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'}; border-bottom: 1px solid #ddd;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: 600;">${driver.name}</td>
              <td style="padding: 12px; border: 1px solid #ddd; font-size: 12px; color: #666;">${driver.email}</td>
              <td style="padding: 12px; text-align: center; border: 1px solid #ddd; font-weight: 600;">${driver.totalDeliveries}</td>
              <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #5B4B8A; font-weight: 600;">MWK ${driver.totalEarnings.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr style="background-color: #f5f3f9; font-weight: bold; border-top: 2px solid #5B4B8A;">
            <td colSpan="2" style="padding: 12px; border: 1px solid #ddd;">TOTAL</td>
            <td style="padding: 12px; text-align: center; border: 1px solid #ddd; color: #333;">${totalOrders}</td>
            <td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: #5B4B8A; font-size: 16px;">MWK ${totalEarnings.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citinati.com</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `sales-by-driver-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateOrderReceiptPDF = (order) => {
  const today = new Date().toLocaleDateString();
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsTotal = order.items ? order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;
  const tax = itemsTotal * 0.1; // 10% tax
  const totalAmount = order.total || itemsTotal + tax;

  // Build items table rows
  const itemsRows = order.items ? order.items.map((item, idx) => {
    const itemTotal = item.price * item.quantity;
    const backgroundColor = idx % 2 === 0 ? '#fff' : '#f9f9f9';
    const productName = item.product?.name || item.productName || 'Product';
    return `
      <tr style="background-color: ${backgroundColor}; border-bottom: 1px solid #eee;">
        <td style="padding: 10px; border: 1px solid #ddd; font-weight: 500; font-size: 12px;">${productName}</td>
        <td style="padding: 10px; text-align: center; border: 1px solid #ddd; font-size: 12px;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; font-size: 12px;">MWK ${item.price.toFixed(2)}</td>
        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; font-weight: 600; font-size: 12px;">MWK ${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('') : '';

  // Build driver info section
  const driverSection = order.driver ? `
    <div style="margin-bottom: 20px; padding: 12px; background-color: #f5f5f5; border-radius: 4px;">
      <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">DELIVERY DRIVER</p>
      <p style="margin: 5px 0 0 0; color: #333; font-weight: 600; font-size: 12px;">${order.driver.name || 'N/A'}</p>
      ${order.driver.phone ? `<p style="margin: 3px 0 0 0; color: #666; font-size: 11px;">📱 ${order.driver.phone}</p>` : ''}
    </div>
  ` : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${buildBrandedHeader({
        reportTitle: 'Order Receipt',
        subText: 'Your Trusted Supermarket',
        generatedText: `Generated on ${today}`,
        supportText: 'Phone: +265 888857188 | Email: info@citinati.com',
        accentColor: BRAND_GREEN,
        compact: true,
      })}

      <!-- Receipt Title -->
      <div style="text-align: center; margin-bottom: 20px;">
        <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">Thank you for your purchase!</p>
      </div>

      <!-- Order Info -->
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 10px;">
          <div>
            <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">ORDER ID</p>
            <p style="margin: 5px 0 0 0; color: #333; font-weight: 600; font-size: 14px;">#${order.id}</p>
          </div>
          <div>
            <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">DATE</p>
            <p style="margin: 5px 0 0 0; color: #333; font-size: 12px;">${orderDate}</p>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">STATUS</p>
            <p style="margin: 5px 0 0 0; color: #4caf50; font-weight: 600; font-size: 12px;">${order.status}</p>
          </div>
          <div>
            <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">PAYMENT STATUS</p>
            <p style="margin: 5px 0 0 0; color: ${order.paymentStatus === 'PAID' ? '#4caf50' : '#f44336'}; font-weight: 600; font-size: 12px;">${order.paymentStatus}</p>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <h3 style="margin: 20px 0 10px 0; color: #333; font-size: 14px;">Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #2D8659; color: white;">
            <th style="padding: 10px; text-align: left; font-weight: bold; border: 1px solid #ddd; font-size: 12px;">Product</th>
            <th style="padding: 10px; text-align: center; font-weight: bold; border: 1px solid #ddd; font-size: 12px;">Qty</th>
            <th style="padding: 10px; text-align: right; font-weight: bold; border: 1px solid #ddd; font-size: 12px;">Price</th>
            <th style="padding: 10px; text-align: right; font-weight: bold; border: 1px solid #ddd; font-size: 12px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="background-color: #f0f9f6; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 150px; gap: 10px; margin-bottom: 8px;">
          <div style="text-align: right; color: #666; font-size: 12px;">Subtotal:</div>
          <div style="text-align: right; font-weight: 600; font-size: 12px;">MWK ${itemsTotal.toFixed(2)}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 150px; gap: 10px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          <div style="text-align: right; color: #666; font-size: 12px;">Tax (10%):</div>
          <div style="text-align: right; font-size: 12px;">MWK ${tax.toFixed(2)}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 150px; gap: 10px;">
          <div style="text-align: right; color: #333; font-weight: bold; font-size: 14px;">TOTAL:</div>
          <div style="text-align: right; font-weight: bold; font-size: 14px; color: #2D8659;">MWK ${totalAmount.toFixed(2)}</div>
        </div>
      </div>

      <!-- Delivery Address -->
      <div style="margin-bottom: 20px;">
        <p style="margin: 0; color: #999; font-size: 11px; font-weight: bold;">DELIVERY ADDRESS</p>
        <p style="margin: 8px 0 0 0; color: #333; font-size: 12px; line-height: 1.5;">
          ${order.deliveryAddress}${order.houseNumber ? '<br />' + order.houseNumber : ''}
        </p>
      </div>

      <!-- Driver Info (if assigned) -->
      ${driverSection}

      <!-- Special Message -->
      <div style="background-color: #e8f5e9; padding: 12px; border-left: 4px solid #4caf50; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; color: #2d5f2e; font-size: 12px; line-height: 1.4;">
          ✓ Your order has been successfully ${order.status === 'DELIVERED' ? 'delivered' : order.status.toLowerCase()}. Thank you for shopping with us!
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; color: #999; font-size: 10px;">
        <p style="margin: 0;">The Brand of Choice That Offers Convenient Shopping Experience</p>
        <p style="margin: 5px 0 0 0;">For support, contact: admin@citinati.com</p>
        <p style="margin: 5px 0 0 0;">Receipt ID: ${order.id}-${new Date().getTime()}</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 5,
    filename: `receipt-order-${order.id}-${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: { scale: 3, logging: false, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }
  };

  html2pdf().set(opt).from(element).save();
};

export const generateAdminOrdersTablePDF = (orders, options = {}) => {
  const {
    statusFilter = 'all',
    priceFilter = 'all',
    driverFilter = 'all',
    selectedDriverName = '',
  } = options;

  const today = new Date();
  const generatedDate = today.toLocaleDateString();
  const generatedTime = today.toLocaleTimeString();

  const statusLabel = statusFilter === 'all' ? 'All Statuses' : statusFilter;
  const priceLabel = priceFilter === 'all'
    ? 'All Totals'
    : priceFilter === 'under_10000'
      ? 'Under MWK 10,000'
      : priceFilter === '10000_50000'
        ? 'MWK 10,000 - 50,000'
        : priceFilter === '50001_100000'
          ? 'MWK 50,001 - 100,000'
          : 'Over MWK 100,000';
  const driverLabel = driverFilter === 'all'
    ? 'All Driver States'
    : driverFilter === 'assigned'
      ? 'Assigned Driver'
      : driverFilter === 'unassigned'
        ? 'Unassigned'
        : `Driver ${selectedDriverName || driverFilter}`;

  const rowsHtml = orders.map((order, idx) => {
    const bgColor = idx % 2 === 0 ? '#fff' : '#f9f9f9';
    const createdAt = new Date(order.createdAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <tr style="background-color: ${bgColor};">
        <td style="padding: 10px; border: 1px solid #ddd;">#${escapeHtml(order.id)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(order.user?.name || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-all;">${escapeHtml(order.user?.email || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">MWK ${new Intl.NumberFormat('en-US').format(Number(order.total || 0))}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${escapeHtml(order.status || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(order.driver?.name || 'Unassigned')}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(createdAt)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; padding: 16px; width: 1120px; box-sizing: border-box;">
      <style>
        .pdf-orders-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
          page-break-inside: auto;
        }

        .pdf-orders-table thead {
          display: table-header-group;
        }

        .pdf-orders-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
          page-break-after: auto;
        }

        .pdf-orders-table td,
        .pdf-orders-table th {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Orders Report',
        periodText: `Status: ${escapeHtml(statusLabel)} | Total: ${escapeHtml(priceLabel)} | Driver: ${escapeHtml(driverLabel)}`,
        generatedText: `Generated: ${escapeHtml(generatedDate)} ${escapeHtml(generatedTime)} | Orders: ${orders.length}`,
        accentColor: BRAND_PURPLE,
      })}

      <table class="pdf-orders-table">
        <colgroup>
          <col style="width: 9%;" />
          <col style="width: 15%;" />
          <col style="width: 22%;" />
          <col style="width: 11%;" />
          <col style="width: 12%;" />
          <col style="width: 13%;" />
          <col style="width: 18%;" />
        </colgroup>
        <thead>
          <tr style="background-color: #5B4B8A; color: white;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Order ID</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Customer</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Email</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Total</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Status</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Driver</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const safeStatus = String(statusLabel || 'all-statuses').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const opt = {
    margin: 6,
    filename: `orders-${safeStatus || 'all-statuses'}-${today.toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: {
      scale: 4,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff',
      letterRendering: true,
      windowWidth: 1200,
    },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4', compress: false },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody'],
    },
  };

  return html2pdf().set(opt).from(element).save();
};

export const generateAdminProductsTablePDF = (products, options = {}) => {
  const { selectedCategory = '' } = options;
  const today = new Date();
  const dateText = today.toLocaleDateString();
  const timeText = today.toLocaleTimeString();
  const categoryLabel = selectedCategory || 'All Categories';

  const rowsHtml = products.map((product, idx) => {
    const productCode = product.productCode || product.sourceCode || product.code || '—';
    const finalPrice = product.isOnSale && product.discountPrice ? product.discountPrice : product.price;
    const pricingText = product.isOnSale && product.discountPrice && product.originalPrice
      ? `${formatProductsCurrency(product.originalPrice)} -> ${formatProductsCurrency(finalPrice)}`
      : formatProductsCurrency(finalPrice);

    const expiryText = product.expiryStatus?.status
      ? (product.expiryStatus.status === 'expired'
        ? 'Expired'
        : `${product.expiryStatus.daysRemaining ?? ''}d left`)
      : '—';

    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">
        <td style="padding: 10px; border: 1px solid #ddd;">#${escapeHtml(product.id)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(product.name)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; word-break: break-all;">${escapeHtml(productCode)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(product.category || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(pricingText)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${escapeHtml(product.stock)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(expiryText)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; padding: 16px; width: 1120px; box-sizing: border-box;">
      <style>
        .pdf-products-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
          page-break-inside: auto;
        }

        .pdf-products-table thead {
          display: table-header-group;
        }

        .pdf-products-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
          page-break-after: auto;
        }

        .pdf-products-table td,
        .pdf-products-table th {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Admin Products Table Export',
        periodText: `Category: ${escapeHtml(categoryLabel)} | Products: ${products.length}`,
        generatedText: `Generated: ${escapeHtml(dateText)} ${escapeHtml(timeText)}`,
        accentColor: BRAND_GREEN,
      })}

      <table class="pdf-products-table">
        <colgroup>
          <col style="width: 9%;" />
          <col style="width: 24%;" />
          <col style="width: 17%;" />
          <col style="width: 15%;" />
          <col style="width: 16%;" />
          <col style="width: 8%;" />
          <col style="width: 11%;" />
        </colgroup>
        <thead>
          <tr style="background-color: #2D8659; color: white;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ID</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Product Code</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Category</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Pricing</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Stock</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Expiry Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const safeCategory = categoryLabel.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const opt = {
    margin: 6,
    filename: `admin-products-${safeCategory || 'all-categories'}-${today.toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: {
      scale: 4,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff',
      letterRendering: true,
      windowWidth: 1200
    },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4', compress: false },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody']
    }
  };

  return html2pdf().set(opt).from(element).save();
};

export const generateAdminUsersTablePDF = (users, options = {}) => {
  const {
    roleFilter = 'all',
    verificationFilter = 'all',
  } = options;

  const today = new Date();
  const dateText = today.toLocaleDateString();
  const timeText = today.toLocaleTimeString();

  const roleLabel = roleFilter === 'all' ? 'All Roles' : roleFilter;
  const verificationLabel = verificationFilter === 'all'
    ? 'All Verification'
    : verificationFilter === 'verified'
      ? 'Verified Email'
      : 'Unverified Email';

  const rowsHtml = users.map((user, idx) => {
    const roleText = String(user.role || 'user');
    const joinedText = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : 'N/A';

    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f9f9f9'};">
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(user.name || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; word-break: break-all;">${escapeHtml(user.email || 'N/A')}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center; text-transform: capitalize;">${escapeHtml(roleText)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${user.emailVerified ? 'Verified' : 'Unverified'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${escapeHtml(joinedText)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; padding: 16px; width: 1120px; box-sizing: border-box;">
      <style>
        .pdf-users-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
          page-break-inside: auto;
        }

        .pdf-users-table thead {
          display: table-header-group;
        }

        .pdf-users-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
          page-break-after: auto;
        }

        .pdf-users-table td,
        .pdf-users-table th {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Admin Users Report',
        periodText: `Role: ${escapeHtml(roleLabel)} | Verification: ${escapeHtml(verificationLabel)} | Users: ${users.length}`,
        generatedText: `Generated: ${escapeHtml(dateText)} ${escapeHtml(timeText)}`,
        accentColor: BRAND_PURPLE,
      })}

      <table class="pdf-users-table">
        <colgroup>
          <col style="width: 23%;" />
          <col style="width: 33%;" />
          <col style="width: 14%;" />
          <col style="width: 14%;" />
          <col style="width: 16%;" />
        </colgroup>
        <thead>
          <tr style="background-color: #5B4B8A; color: white;">
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Email</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Role</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Email Status</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Joined</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const safeRole = String(roleLabel || 'all-roles').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const opt = {
    margin: 6,
    filename: `admin-users-${safeRole || 'all-roles'}-${today.toISOString().split('T')[0]}.pdf`,
    image: { type: 'png', quality: 1.0 },
    html2canvas: {
      scale: 4,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff',
      letterRendering: true,
      windowWidth: 1200,
    },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4', compress: false },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody'],
    },
  };

  return html2pdf().set(opt).from(element).save();
};

const formatExpiryPdfDate = (value) => {
  if (!value) return 'No expiry date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No expiry date';
  return parsed.toLocaleDateString('en-GB');
};

export const generateExpiryAlertsPDF = (alertCards, options = {}) => {
  const {
    selectedCategory = '',
    selectedStockFilter = 'all',
  } = options;
  const today = new Date();
  const dateText = today.toLocaleDateString('en-GB');
  const timeText = today.toLocaleTimeString();
  const categoryLabel = selectedCategory || 'All Categories';
  const stockFilterLabel = selectedStockFilter === 'all'
    ? 'All Stock Levels'
    : selectedStockFilter === 'in-stock'
      ? 'In Stock'
      : selectedStockFilter === 'low-stock'
        ? 'Low Stock'
        : 'Out of Stock';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const drawPageHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(45, 134, 89);
    doc.text('Citi-Nati Supermarket', pageWidth / 2, y, { align: 'center' });

    y += 7;
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text('Expiry Alert Cards Export', pageWidth / 2, y, { align: 'center' });

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Category: ${categoryLabel} | Stock Filter: ${stockFilterLabel} | Products: ${alertCards.length}`, pageWidth / 2, y, { align: 'center' });

    y += 5;
    doc.text(`Generated: ${dateText} ${timeText}`, pageWidth / 2, y, { align: 'center' });

    y += 4;
    doc.setDrawColor(220, 53, 69);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  drawPageHeader();

  if (!Array.isArray(alertCards) || alertCards.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text('No expiry cards matched the selected filters.', margin, y + 10);
    doc.save(`expiry-alerts-${today.toISOString().split('T')[0]}.pdf`);
    return;
  }

  alertCards.forEach((card, cardIndex) => {
    if (y > pageHeight - 45) {
      doc.addPage();
      y = margin;
      drawPageHeader();
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text(String(card.name || 'Unknown Product'), margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    y += 5;
    doc.text(`Code: ${card.productCode || 'N/A'} | Category: ${card.category || 'Uncategorized'}`, margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text(`${Array.isArray(card.batches) ? card.batches.length : 0} batch${Array.isArray(card.batches) && card.batches.length === 1 ? '' : 'es'}`, pageWidth - margin, y, { align: 'right' });

    const tableRows = (Array.isArray(card.batches) ? card.batches : []).map((batch, batchIndex) => {
      const batchLabel = batch?.grnNo && batch?.stockDetailId
        ? `GRN ${batch.grnNo} / SD ${batch.stockDetailId}`
        : batch?.grnNo
          ? `GRN ${batch.grnNo}`
          : batch?.stockDetailId
            ? `Stock Detail ${batch.stockDetailId}`
            : `Batch ${batchIndex + 1}${batch?.batchNo ? ` (${batch.batchNo})` : ''}`;

      return [
        batchLabel,
        batch?.receivedQty != null ? String(batch.receivedQty) : '-',
        formatExpiryPdfDate(batch?.expiryDate),
        batch?.statusLabel || '-',
      ];
    });

    autoTable(doc, {
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Batch', 'Received Qty', 'Expiry Date', 'Status']],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        textColor: [34, 34, 34],
        cellPadding: 1.8,
        lineColor: [225, 225, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [45, 134, 89],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 78 },
        1: { cellWidth: 26, halign: 'center' },
        2: { cellWidth: 36 },
        3: { cellWidth: 'auto' },
      },
      pageBreak: 'auto',
    });

    y = (doc.lastAutoTable?.finalY || y + 10) + 4;

    if (cardIndex < alertCards.length - 1) {
      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
    }
  });

  doc.save(`expiry-alerts-${today.toISOString().split('T')[0]}.pdf`);
};
