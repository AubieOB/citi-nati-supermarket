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
