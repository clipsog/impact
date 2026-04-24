/**
 * Loads https://www.youtube.com/iframe_api once and resolves when `window.YT.Player` exists.
 */

let apiPromise: Promise<void> | null = null;

export const YT_STATE_ENDED = 0;
export const YT_STATE_PLAYING = 1;
export const YT_STATE_PAUSED = 2;
export const YT_STATE_BUFFERING = 3;
export const YT_STATE_CUED = 5;

export type YTPlayerInstance = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTPlayerConstructor = new (
  container: HTMLElement | string,
  options: {
    videoId: string;
    playerVars?: Record<string, string | number | undefined>;
    events?: {
      onReady?: (e: { target: YTPlayerInstance }) => void;
      onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
    };
  }
) => YTPlayerInstance;

export function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const win = window as unknown as {
    YT?: { Player: YTPlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  };

  if (win.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const ok = () => {
      if (settled) return;
      if (win.YT?.Player) {
        settled = true;
        resolve();
      }
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      apiPromise = null;
      reject(err);
    };

    const prev = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      ok();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => fail(new Error('Failed to load YouTube IFrame API script'));
      document.head.appendChild(tag);
    }

    const start = Date.now();
    const poll = () => {
      if (win.YT?.Player) {
        ok();
        if (settled) return;
      }
      if (Date.now() - start > 25_000) {
        fail(new Error('YouTube IFrame API timeout'));
        return;
      }
      if (!settled) window.setTimeout(poll, 50);
    };
    poll();
  });

  return apiPromise;
}
