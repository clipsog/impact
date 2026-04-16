import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import youtubedl, { create as createYoutubeDl } from 'youtube-dl-exec';

let cached: typeof youtubedl | null = null;

/**
 * Returns a youtube-dl-exec bound to the real binary under node_modules.
 * Avoids relying on process.cwd() + ./node_modules/... (wrong under some hosts / bundles).
 */
export function getYoutubeDlExec(): typeof youtubedl {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve('youtube-dl-exec/package.json'));
  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const bin = path.join(pkgDir, 'bin', filename);
  // create() returns the same callable shape as the default export; types differ slightly.
  cached = (existsSync(bin) ? createYoutubeDl(bin) : youtubedl) as typeof youtubedl;
  return cached;
}
