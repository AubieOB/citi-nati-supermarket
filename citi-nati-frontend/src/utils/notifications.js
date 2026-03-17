import toast from 'react-hot-toast';

/**
 * Notification sound file
 * Place notification.wav or notification.mp3 in /public folder
 */
const NOTIFICATION_SOUND_URL = '/classic-door-bell.wav';
const NOTIFICATION_SPEECH_RATE = 1;
const NOTIFICATION_SPEECH_PITCH = 1;
const NOTIFICATION_SPEECH_VOLUME = 1;
const SPEECH_ALERTS_STORAGE_KEY = 'citi-nati-speech-alerts-enabled';

// Create multiple audio instances for simultaneous notifications
let audioPool = [];
let currentAudioIndex = 0;
const AUDIO_POOL_SIZE = 3;
let selectedSpeechVoice = null;
const FEMALE_VOICE_HINTS = [
  'female',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'zira',
  'jenny',
  'aria',
  'sara',
  'libby',
  'sonia',
  'natasha',
  'ava',
  'emma'
];

const cleanSpeechText = (text) => String(text || '')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
  .replace(/[\u{2600}-\u{27BF}]/gu, ' ')
  .replace(/[#*_`~]+/g, ' ')
  .replace(/[✓✔✅☑☒✖❌⚠️⚠🚚📦📍🎉🔴🟡🟢]/gu, ' ')
  .replace(/[|<>()[\]{}]/g, ' ')
  .replace(/[:;]+/g, '. ')
  .replace(/\s+/g, ' ')
  .trim();

const getSpeechAlertsEnabled = () => {
  if (typeof window === 'undefined') return true;

  const storedValue = window.localStorage.getItem(SPEECH_ALERTS_STORAGE_KEY);
  if (storedValue === null) return true;
  return storedValue === 'true';
};

const setSpeechAlertsEnabled = (enabled) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SPEECH_ALERTS_STORAGE_KEY, String(Boolean(enabled)));
};

const pickSpeechVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const englishVoices = voices.filter((voice) => /en-(US|GB)|^en/i.test(voice.lang));

  const preferredFemaleVoice = englishVoices.find((voice) =>
    FEMALE_VOICE_HINTS.some((hint) => voice.name.toLowerCase().includes(hint))
  );

  const preferredVoice = preferredFemaleVoice || englishVoices.find((voice) =>
    /(Google|Microsoft|Samantha|Jenny|Aria|Sara|Libby|Zira)/i.test(voice.name)
  );

  return preferredVoice || englishVoices[0] || voices[0];
};

const speakNotification = (text) => {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!getSpeechAlertsEnabled()) return;

    const spokenText = cleanSpeechText(text);
    if (!spokenText) return;

    if (!selectedSpeechVoice) {
      selectedSpeechVoice = pickSpeechVoice();
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = NOTIFICATION_SPEECH_RATE;
    utterance.pitch = NOTIFICATION_SPEECH_PITCH;
    utterance.volume = NOTIFICATION_SPEECH_VOLUME;

    if (selectedSpeechVoice) {
      utterance.voice = selectedSpeechVoice;
      utterance.lang = selectedSpeechVoice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[Notification] Speech synthesis failed:', err.message);
  }
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    selectedSpeechVoice = pickSpeechVoice();
  };
}

/**
 * Initialize audio pool on first use
 */
const initializeAudioPool = () => {
  if (audioPool.length === 0) {
    for (let i = 0; i < AUDIO_POOL_SIZE; i++) {
      const audio = new Audio(NOTIFICATION_SOUND_URL);
      audio.preload = 'auto';
      audio.volume = 0.8;
      audioPool.push(audio);
    }
    console.log('[Notification] Audio pool initialized with', AUDIO_POOL_SIZE, 'instances');
  }
};

/**
 * Get next available audio instance from pool
 */
const getPooledAudio = () => {
  initializeAudioPool();
  const audio = audioPool[currentAudioIndex];
  currentAudioIndex = (currentAudioIndex + 1) % AUDIO_POOL_SIZE;
  return audio;
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
    
    // Double beep pattern for better audibility
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.1);
    
    // Second beep
    osc.start(audioContext.currentTime + 0.15);
    osc.stop(audioContext.currentTime + 0.25);
    
    console.log('[Notification] ✅ Fallback beep played (Web Audio API)');
  } catch (err) {
    console.warn('[Notification] Fallback beep failed:', err.message);
  }
};

/**
 * Play notification sound in real-time
 * Uses audio pool for simultaneous notifications
 * With fallback to Web Audio API beep
 */
const playNotificationSound = () => {
  try {
    // Initialize pool on first use
    initializeAudioPool();
    
    // Get next audio from pool
    const audio = getPooledAudio();
    
    // Pause and reset to beginning
    audio.pause();
    audio.currentTime = 0;
    
    // Play with proper error handling
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[Notification] ✅ Sound played successfully');
        })
        .catch((err) => {
          console.warn('[Notification] ⚠️ File audio failed:', err.message);
          // Fallback to Web Audio API beep
          playFallbackBeep();
        });
    } else {
      // Browser doesn't support Promise on play
      console.log('[Notification] Browser does not support play() promise');
    }
  } catch (err) {
    console.error('[Notification] Sound initialization failed:', err.message);
    // Fallback to beep
    playFallbackBeep();
  }
};

/**
 * Show success notification with sound and toast
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const notifySuccess = (message, duration = 4000, speechText = message) => {
  playNotificationSound();
  speakNotification(speechText);
  toast.success(message, { duration });
};

/**
 * Show info notification with sound and toast
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
export const notifyInfo = (message, duration = 3000, speechText = message) => {
  playNotificationSound();
  speakNotification(speechText);
  toast(message, { duration });
};

/**
 * Show error notification WITH SOUND
 * @param {string} message - The notification message
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export const notifyError = (message, duration = 4000, speechText = message) => {
  playNotificationSound();
  speakNotification(speechText);
  toast.error(message, { duration });
};

/**
 * Generic notify function
 * @param {string} message - The notification message
 * @param {string} type - 'success', 'info', or 'error'
 * @param {number} duration - Duration in milliseconds
 */
export const notify = (message, type = 'info', duration = 3000, speechText = message) => {
  if (type === 'success') {
    notifySuccess(message, duration, speechText);
  } else if (type === 'error') {
    notifyError(message, duration, speechText);
  } else {
    notifyInfo(message, duration, speechText);
  }
};

// Export playNotificationSound as named export for use in components
export { playNotificationSound, speakNotification, getSpeechAlertsEnabled, setSpeechAlertsEnabled };

export default {
  notifySuccess,
  notifyInfo,
  notifyError,
  notify,
  playNotificationSound,
  speakNotification,
  getSpeechAlertsEnabled,
  setSpeechAlertsEnabled,
};
