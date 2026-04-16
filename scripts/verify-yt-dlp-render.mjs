#!/usr/bin/env node
/**
 * On Render, fail the build early if youtube-dl-exec did not download yt-dlp
 * (e.g. npm ci with ignore-scripts, or GitHub API rate limit during postinstall).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.RENDER !== 'true') {
  process.exit(0);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const pkgDir = path.dirname(require.resolve('youtube-dl-exec/package.json'));
const bin = path.join(pkgDir, 'bin', 'yt-dlp');

if (!existsSync(bin)) {
  console.error('[verify-yt-dlp-render] Missing binary:', bin);
  console.error('Fix: ensure Render runs npm install with lifecycle scripts enabled.');
  console.error('If GitHub rate-limits the yt-dlp download, set a GITHUB_TOKEN (or GH_TOKEN) env var on the service for builds.');
  process.exit(1);
}

console.log('[verify-yt-dlp-render] OK', bin);
