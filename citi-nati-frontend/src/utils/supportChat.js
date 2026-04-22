export const MAX_SUPPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_ACCEPT = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
].join(',');

export const getSupportAttachmentIcon = (fileName = '', mimeType = '') => {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  const normalizedMime = String(mimeType).toLowerCase();

  if (normalizedMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return 'fa-image';
  }

  if (normalizedMime.includes('pdf') || ext === 'pdf') {
    return 'fa-file-pdf';
  }

  if (normalizedMime.includes('word') || ['doc', 'docx'].includes(ext)) {
    return 'fa-file-word';
  }

  if (normalizedMime.includes('excel') || normalizedMime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'fa-file-excel';
  }

  if (normalizedMime.startsWith('text/') || ['txt', 'md'].includes(ext)) {
    return 'fa-file-lines';
  }

  if (normalizedMime.includes('zip') || ['zip', 'rar', '7z'].includes(ext)) {
    return 'fa-file-zipper';
  }

  return 'fa-file';
};

export const buildSupportAttachmentDownloadUrl = (apiClient, attachment) => {
  const filename = attachment?.fileUrl?.split('/').pop() || attachment?.fileName || '';
  const backendBaseUrl = apiClient.defaults.baseURL?.replace('/api', '') || 'http://localhost:5000';
  return `${backendBaseUrl}/api/support/download-attachment/${filename}`;
};

export const mergeReplyIntoReplyList = (replies = [], reply) => {
  if (!reply?.id) {
    return reply ? [...replies, reply] : replies;
  }

  const targetReplyId = String(reply.id);
  const existingIndex = replies.findIndex((entry) => String(entry.id) === targetReplyId);
  if (existingIndex === -1) {
    return [...replies, reply];
  }

  return replies.map((entry) => (String(entry.id) === targetReplyId ? { ...entry, ...reply } : entry));
};

export const mergeReplyIntoTicket = (ticket, reply) => {
  if (!ticket || String(ticket.id) !== String(reply?.ticketId)) {
    return ticket;
  }

  return {
    ...ticket,
    updatedAt: reply.createdAt || new Date().toISOString(),
    replies: mergeReplyIntoReplyList(ticket.replies || [], reply),
  };
};

export const mergeReplyIntoTicketList = (tickets = [], reply) => {
  const updatedTickets = tickets.map((ticket) => mergeReplyIntoTicket(ticket, reply));
  return updatedTickets.sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime());
};

export const dedupeTicketsById = (tickets = []) => {
  const ticketMap = new Map();

  tickets.forEach((ticket) => {
    if (!ticket || ticket.id == null) return;
    const normalizedId = String(ticket.id);
    const current = ticketMap.get(normalizedId);

    if (!current) {
      ticketMap.set(normalizedId, ticket);
      return;
    }

    const currentTimestamp = new Date(current.updatedAt || current.createdAt || 0).getTime();
    const candidateTimestamp = new Date(ticket.updatedAt || ticket.createdAt || 0).getTime();

    if (candidateTimestamp >= currentTimestamp) {
      ticketMap.set(normalizedId, { ...current, ...ticket });
    }
  });

  return Array.from(ticketMap.values()).sort(
    (left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime(),
  );
};

export const upsertTicketById = (tickets = [], candidateTicket) => {
  if (!candidateTicket || candidateTicket.id == null) {
    return dedupeTicketsById(tickets);
  }

  const normalizedId = String(candidateTicket.id);
  const nextTickets = tickets.map((ticket) => {
    if (String(ticket.id) !== normalizedId) {
      return ticket;
    }

    return {
      ...ticket,
      ...candidateTicket,
      replies: candidateTicket.replies || ticket.replies || [],
    };
  });

  if (!nextTickets.some((ticket) => String(ticket.id) === normalizedId)) {
    nextTickets.unshift(candidateTicket);
  }

  return dedupeTicketsById(nextTickets);
};

export const appendValidatedSupportFiles = (currentFiles, incomingFiles, notifyError) => {
  const nextFiles = [...currentFiles];

  incomingFiles.forEach((file) => {
    if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
      notifyError?.(`File ${file.name} is larger than 5MB`);
      return;
    }

    const alreadyAdded = nextFiles.some((entry) => (
      entry.name === file.name
      && entry.size === file.size
      && entry.lastModified === file.lastModified
    ));

    if (!alreadyAdded) {
      nextFiles.push(file);
    }
  });

  return nextFiles;
};

export const formatSupportTime = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};