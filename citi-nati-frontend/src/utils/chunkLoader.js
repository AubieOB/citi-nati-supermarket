/**
 * Handle dynamic chunk loading failures
 * This catches cases where lazy-loaded chunks fail to load and triggers a page refresh
 * 
 * Common causes:
 * - Network errors during chunk download
 * - Chunks not deployed on server
 * - Server returning wrong MIME type (e.g., HTML instead of JS)
 * - Cache issues
 */

let refreshing = false;

// Handle failed chunk loads
window.addEventListener('error', (event) => {
  if (
    event.message && 
    event.message.includes('Failed to fetch dynamically imported module')
  ) {
    console.error('[CHUNK LOADER] Dynamic import failed:', event.message);
    
    if (!refreshing) {
      refreshing = true;
      console.warn('[CHUNK LOADER] Refreshing page to reload all chunks...');
      
      // Add small delay to ensure logs are visible
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }
}, true);

// Handle unhandledrejection for Promise-based module failures
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason && 
    (event.reason.message?.includes('Failed to fetch') || 
     event.reason.message?.includes('dynamically imported'))
  ) {
    console.error('[CHUNK LOADER] Unhandled promise rejection for chunk:', event.reason);
    
    if (!refreshing) {
      refreshing = true;
      console.warn('[CHUNK LOADER] Refreshing page to reload all chunks...');
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }
});

console.log('[CHUNK LOADER] Chunk error handler installed');
