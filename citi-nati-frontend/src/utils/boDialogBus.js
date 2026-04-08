let boDialogHandler = null;

export function registerBoDialogHandler(handler) {
  boDialogHandler = handler;
  return () => {
    if (boDialogHandler === handler) {
      boDialogHandler = null;
    }
  };
}

export function boAlert({ title = 'Business Operations', message = '', type = 'info', confirmText = 'OK' } = {}) {
  if (!boDialogHandler) {
    if (typeof window !== 'undefined') {
      window.alert(message || title);
    }
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    boDialogHandler({
      title,
      message,
      type,
      confirmText,
      showCancelButton: false,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export function boConfirm({
  title = 'Please Confirm',
  message = '',
  type = 'confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
} = {}) {
  if (!boDialogHandler) {
    const fallbackMessage = message || title;
    if (typeof window !== 'undefined') {
      return Promise.resolve(window.confirm(fallbackMessage));
    }
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    boDialogHandler({
      title,
      message,
      type,
      confirmText,
      cancelText,
      showCancelButton: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
