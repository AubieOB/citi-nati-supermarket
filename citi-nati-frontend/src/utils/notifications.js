import toast from 'react-hot-toast';

/**
 * Notification sound file
 * Place notification.wav or notification.mp3 in /public folder
 */
const NOTIFICATION_SOUND_URL = '/classic-door-bell.wav';

/**
 * Play notification sound
 * Gracefully handles autoplay restrictions
 */
const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch((err) => {
      console.warn('[Notification] Could not play sound:', err.message);
      // Autoplay restricted or file not found - ignore silently
    });
  } catch (err) {
    console.warn('[Notification] Sound initialization failed:', err.message);
  }
};

/**
 * Show success notification with sound and toast
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const notifySuccess = (message, duration = 4000) => {
  playNotificationSound();
  toast.success(message, { duration });
};

/**
 * Show info notification with sound and toast
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
export const notifyInfo = (message, duration = 3000) => {
  playNotificationSound();
  toast(message, { duration });
};

/**
 * Show error notification (no sound)
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const notifyError = (message, duration = 4000) => {
  toast.error(message, { duration });
};

/**
 * Generic notify function
 * @param {string} message - The notification message
 * @param {string} type - 'success', 'info', or 'error'
 * @param {number} duration - Duration in milliseconds
 */
export const notify = (message, type = 'info', duration = 3000) => {
  if (type === 'success') {
    notifySuccess(message, duration);
  } else if (type === 'error') {
    notifyError(message, duration);
  } else {
    notifyInfo(message, duration);
  }
};

export default {
  notifySuccess,
  notifyInfo,
  notifyError,
  notify,
};
