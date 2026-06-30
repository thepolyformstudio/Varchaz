import { lazy, ComponentType } from 'react';

/**
 * A wrapper around React.lazy that catches ChunkLoadErrors / failed dynamic imports,
 * which typically happen when a new version of the app has been deployed and the user's
 * browser is trying to fetch old chunk files that no longer exist on the server.
 * When this error is caught, it forces a full page reload once to fetch the latest index.html
 * and bundle files from the server.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error: any) {
      console.error('Lazy load error captured:', error);

      // Check if this error looks like a chunk loading / module fetch failure
      const errorMessage = error?.message || '';
      const errorName = error?.name || '';
      const isChunkLoadFailed =
        errorName === 'ChunkLoadError' ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('dynamically imported module') ||
        errorMessage.includes('dynamic import');

      if (isChunkLoadFailed) {
        // Prevent infinite reload loops by checking session storage
        const reloadKey = 'chunk-load-failed-reload';
        const lastReload = sessionStorage.getItem(reloadKey);
        const now = Date.now();

        // If we haven't reloaded due to a chunk load error in the last 10 seconds, reload.
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem(reloadKey, now.toString());
          console.warn('Chunk load failed. Refreshing page to fetch latest bundles...');
          window.location.reload();

          // Return a dummy promise that never resolves while the page is reloading
          return new Promise<{ default: T }>(() => {});
        }
      }

      // If it's some other error, or we already retried and it still failed, propagate the error
      throw error;
    }
  });
}
