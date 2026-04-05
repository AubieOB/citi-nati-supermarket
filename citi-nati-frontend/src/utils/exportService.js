import api from './api.js';

function parseFileName(contentDisposition, fallbackName) {
  if (!contentDisposition) return fallbackName;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackName;
}

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

async function readBlobError(blob) {
  if (!(blob instanceof Blob)) return null;

  try {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    return parsed?.error || parsed?.message || null;
  } catch {
    return null;
  }
}

export async function downloadBusinessReport({ format, module, type, filters = {} }) {
  const safeFormat = format === 'pdf' ? 'pdf' : 'excel';
  const extension = safeFormat === 'pdf' ? 'pdf' : 'xlsx';
  const fallbackName = `${String(module || 'report').replace(/\s+/g, '_').toLowerCase()}_${String(type || 'summary').replace(/\s+/g, '_').toLowerCase()}.${extension}`;

  let response;

  try {
    response = await api.post(
      `/business-operations/export/${safeFormat}`,
      { module, type, filters },
      { responseType: 'blob' },
    );
  } catch (error) {
    const blobMessage = await readBlobError(error?.response?.data);
    if (blobMessage) {
      const wrapped = new Error(blobMessage);
      wrapped.response = { data: { error: blobMessage } };
      throw wrapped;
    }
    throw error;
  }

  const fileName = parseFileName(response.headers?.['content-disposition'], fallbackName);
  triggerDownload(response.data, fileName);
}

export async function downloadFullBusinessWorkbook({ filters = {} } = {}) {
  const queryParams = new URLSearchParams();
  if (filters.locationId) queryParams.set('locationId', String(filters.locationId));
  if (filters.branchCode) queryParams.set('branchCode', String(filters.branchCode));
  if (filters.syncSourceCode) queryParams.set('syncSourceCode', String(filters.syncSourceCode));
  if (filters.startDate) queryParams.set('startDate', String(filters.startDate));
  if (filters.endDate) queryParams.set('endDate', String(filters.endDate));

  const query = queryParams.toString();
  const url = `/business-operations/payroll/export/full-workbook${query ? `?${query}` : ''}`;

  let response;
  try {
    response = await api.get(url, { responseType: 'blob' });
  } catch (error) {
    const blobMessage = await readBlobError(error?.response?.data);
    if (blobMessage) {
      const wrapped = new Error(blobMessage);
      wrapped.response = { data: { error: blobMessage } };
      throw wrapped;
    }
    throw error;
  }

  const fallbackName = `citi-nati-full-workbook-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const fileName = parseFileName(response.headers?.['content-disposition'], fallbackName);
  triggerDownload(response.data, fileName);
}

export async function importFullBusinessWorkbook({ file, upsert = true, clearExisting = false, locationId = null }) {
  if (!file) {
    throw new Error('Workbook file is required.');
  }

  const formData = new FormData();
  formData.append('workbook', file);
  formData.append('upsert', upsert ? 'true' : 'false');
  formData.append('clearExisting', clearExisting ? 'true' : 'false');
  if (locationId) formData.append('locationId', String(locationId));

  const response = await api.post('/business-operations/payroll/import/full-workbook', formData);
  return response?.data;
}
