import { useState, useCallback } from 'react';

export const useModal = () => {
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    showCancelButton: true,
    confirmButtonColor: null,
    children: null,
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showModal = useCallback((config) => {
    setModal((prev) => ({
      ...prev,
      isOpen: true,
      title: config.title || 'Alert',
      message: config.message || '',
      type: config.type || 'info',
      confirmText: config.confirmText || 'Confirm',
      cancelText: config.cancelText || 'Cancel',
      showCancelButton: config.showCancelButton !== undefined ? config.showCancelButton : true,
      confirmButtonColor: config.confirmButtonColor || null,
      children: config.children || null,
      onConfirm: config.onConfirm || (() => closeModal()),
      onCancel: config.onCancel || (() => closeModal()),
    }));
  }, []);

  const closeModal = useCallback(() => {
    setModal((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  // Convenience methods
  const showAlert = useCallback((title, message, onConfirm) => {
    showModal({
      title,
      message,
      type: 'info',
      showCancelButton: false,
      confirmText: 'OK',
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeModal();
      },
    });
  }, [showModal, closeModal]);

  const showError = useCallback((title, message, onConfirm) => {
    showModal({
      title,
      message,
      type: 'error',
      showCancelButton: false,
      confirmText: 'OK',
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeModal();
      },
    });
  }, [showModal, closeModal]);

  const showSuccess = useCallback((title, message, onConfirm) => {
    showModal({
      title,
      message,
      type: 'success',
      showCancelButton: false,
      confirmText: 'OK',
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeModal();
      },
    });
  }, [showModal, closeModal]);

  const showWarning = useCallback((title, message, onConfirm) => {
    showModal({
      title,
      message,
      type: 'warning',
      showCancelButton: false,
      confirmText: 'OK',
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeModal();
      },
    });
  }, [showModal, closeModal]);

  const showConfirm = useCallback((title, message, onConfirm, onCancel) => {
    showModal({
      title,
      message,
      type: 'confirm',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      showCancelButton: true,
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeModal();
      },
      onCancel: () => {
        if (onCancel) onCancel();
        closeModal();
      },
    });
  }, [showModal, closeModal]);

  return {
    modal,
    showModal,
    closeModal,
    showAlert,
    showError,
    showSuccess,
    showWarning,
    showConfirm,
  };
};
