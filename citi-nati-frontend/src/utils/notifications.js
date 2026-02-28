import toast from 'react-hot-toast';

/**
 * Notification sound file
 * Place notification.wav or notification.mp3 in /public folder
 */
const NOTIFICATION_SOUND_URL = '/classic-door-bell.wav';

// Cache audio element and context for better performance
let cachedAudio = null;

/**
 * Pre-load and cache the audio element on first use
 */
const getCachedAudio = () => {
  if (!cachedAudio) {
    cachedAudio = new Audio(NOTIFICATION_SOUND_URL);
    cachedAudio.preload = 'auto';
  }
  return cachedAudio;
};

/**
 * Fallback: Play sound using Web Audio API (synthesized beep)
 */
const playFallbackBeep = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    // Beep pattern: high-low beep
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.15);
    
    console.log('[Notification] ✅ Fallback beep played (Web Audio API)');
  } catch (err) {
    console.warn('[Notification] Fallback beep failed:', err.message);
  }
};

/**
 * Play notification sound
 * Tries file first, falls back to Web Audio API beep if file fails
 */
const playNotificationSound = () => {
  try {
    const audio = getCachedAudio();
    
    // Reset currentTime to allow rapid replays
    audio.currentTime = 0;
    audio.volume = 0.8; // Increased volume from 0.6 to 0.8
    
    // Attempt to play and log result
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[Notification] ✅ Sound played successfully');
        })
        .catch((err) => {
          console.warn('[Notification] ⚠️ File audio failed:', err.message);
          console.log('[Notification] Attempting fallback beep...');
          // Fallback to Web Audio API beep
          playFallbackBeep();
        });
    }
  } catch (err) {
    console.error('[Notification] Sound initialization failed:', err.message);
    console.log('[Notification] Attempting fallback beep...');
    playFallbackBeep();
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
 * Show error notification WITH SOUND
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const notifyError = (message, duration = 4000) => {
  playNotificationSound();
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
