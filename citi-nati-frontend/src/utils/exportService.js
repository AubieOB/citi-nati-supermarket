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

export async function downloadBusinessReport({ format, module, type, filters = {} }) {
  const safeFormat = format === 'pdf' ? 'pdf' : 'excel';
  const extension = safeFormat === 'pdf' ? 'pdf' : 'xlsx';
  const fallbackName = `${String(module || 'report').replace(/\s+/g, '_').toLowerCase()}_${String(type || 'summary').replace(/\s+/g, '_').toLowerCase()}.${extension}`;

  const response = await api.post(
    `/business-operations/export/${safeFormat}`,
    { module, type, filters },
    { responseType: 'blob' },
  );

  const fileName = parseFileName(response.headers?.['content-disposition'], fallbackName);
  triggerDownload(response.data, fileName);
}
