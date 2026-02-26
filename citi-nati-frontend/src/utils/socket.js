import io from 'socket.io-client';
import { tokenStorage } from './tokenStorage.js';

let socket = null;

/**
 * Initialize WebSocket connection with auth
 * Called once on app startup
 */
export const initSocket = () => {
  if (socket) return socket;

  try {
    const token = tokenStorage.getToken();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

    console.log('[SOCKET] Initializing connection to:', backendUrl);

    socket = io(backendUrl, {
      auth: {
        token: token || undefined,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[SOCKET] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Disconnected');
    });

    socket.on('error', (error) => {
      console.error('[SOCKET] Error:', error);
    });

    socket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error);
    });

    return socket;
  } catch (err) {
    console.error('[SOCKET] Initialization failed:', err);
    return null;
  }
};

/**
 * Get existing socket instance
 */
export const getSocket = () => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};

/**
 * Identify socket with user info to join appropriate rooms
 * Sends identify event to backend to join role-based rooms
 */
export const identifySocket = (userId, role = 'user', email = null) => {
  try {
    console.log(`[SOCKET] Identifying socket with userId=${userId}, role=${role}, email=${email}`);
    const s = getSocket();
    
    if (!s) {
      console.error('[SOCKET] Socket not initialized');
      return;
    }

    const identifyData = { userId, role, email };
    
    if (s.connected) {
      console.log(`[SOCKET] Socket already connected, emitting identify:`, identifyData);
      s.emit('identify', identifyData);
    } else {
      console.log(`[SOCKET] Socket not connected yet, waiting for connection...`);
      // Wait for connection then identify - use on() not once() in case reconnect happens
      const handleConnect = () => {
        console.log(`[SOCKET] Socket connected, emitting identify:`, identifyData);
        s.emit('identify', identifyData);
        // Only listen once, then remove listener
        s.off('connect', handleConnect);
      };
      s.on('connect', handleConnect);
    }
  } catch (err) {
    console.error('[SOCKET] Identify failed:', err);
  }
};

/**
 * Close socket connection
 */
export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Manually reconnect socket
 */
export const reconnectSocket = () => {
  if (socket) {
    socket.connect();
  } else {
    initSocket();
  }
};
