import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import ytdl from '@distube/ytdl-core';
import { extractYoutubeVideoId } from '@/lib/youtube';

const execAsync = promisify(exec);

/** There is no legitimate third-party “free unlimited” HTTP API for raw YouTube streams; we use fast in-process extraction + cache, then yt-dlp as fallback. */

type BeatPayload = {
  streamUrl: string;
  title: string;
  lengthSeconds: number;
};

const CACHE_TTL_MS = 25 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { payload: BeatPayload; expires: number }>();

function cacheKeyForUrl(url: string): string {
  return extractYoutubeVideoId(url) ?? url;
}

function getCached(key: string): BeatPayload | null {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.expires) {
    cache.delete(key);
    return null;
  }
  return row.payload;
}

function setCached(key: string, payload: BeatPayload) {
  while (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, { payload, expires: Date.now() + CACHE_TTL_MS });
}

async function tryYtdlCore(url: string): Promise<BeatPayload | null> {
  try {
    const info = await ytdl.getInfo(url);
    let format;
    try {
      format = ytdl.chooseFormat(info.formats, {
        filter: (f) => Boolean(f.hasAudio && !f.hasVideo && f.mimeType?.includes('mp4')),
        quality: 'highestaudio',
      });
    } catch {
      format = ytdl.chooseFormat(info.formats, {
        filter: 'audioonly',
        quality: 'highestaudio',
      });
    }
    if (!format?.url) return null;
    const title = info.videoDetails?.title || 'Unknown Title';
    const lengthSeconds = Number(info.videoDetails?.lengthSeconds) || 0;
    return { streamUrl: format.url, title, lengthSeconds };
  } catch {
    return null;
  }
}

async function tryYtDlp(url: string): Promise<BeatPayload | null> {
  const cwd = process.cwd();
  const format =
    'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio[protocol^=https]/bestaudio/best';
  const command = `./node_modules/youtube-dl-exec/bin/yt-dlp "${url}" --dump-single-json --no-warnings --no-check-certificate --referer "https://www.youtube.com/" --format "${format}"`;

  const { stdout } = await execAsync(command, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 45_000,
  });
  const output = JSON.parse(stdout) as Record<string, unknown>;

  const streamUrl =
    (output.url as string | undefined) ||
    (Array.isArray(output.requested_downloads) &&
      (output.requested_downloads as { url?: string }[])?.[0]?.url) ||
    (output.entries as { url?: string }[] | undefined)?.[0]?.url;

  if (!streamUrl) return null;

  const title =
    (output.title as string) ||
    (Array.isArray(output.entries) && (output.entries as { title?: string }[])[0]?.title) ||
    'Unknown Title';
  const lengthSeconds =
    Number(output.duration) ||
    (Array.isArray(output.entries) && Number((output.entries as { duration?: number }[])[0]?.duration)) ||
    0;

  return { streamUrl, title, lengthSeconds };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const cacheKey = cacheKeyForUrl(url);
  const hit = getCached(cacheKey);
  if (hit) {
    return NextResponse.json({
      title: hit.title,
      streamUrl: hit.streamUrl,
      lengthSeconds: hit.lengthSeconds,
      source: 'cache',
    });
  }

  try {
    const fromCore = await tryYtdlCore(url);
    if (fromCore) {
      setCached(cacheKey, fromCore);
      return NextResponse.json({ ...fromCore, source: 'ytdl-core' });
    }

    const fromDlp = await tryYtDlp(url);
    if (fromDlp) {
      setCached(cacheKey, fromDlp);
      return NextResponse.json({ ...fromDlp, source: 'yt-dlp' });
    }

    return NextResponse.json({ error: 'No stream URL found' }, { status: 502 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
    const timedOut = message.includes('ETIMEDOUT') || code === 'ETIMEDOUT' || message.toLowerCase().includes('timeout');
    console.error('YouTube route error:', message, code);
    return NextResponse.json(
      { error: timedOut ? 'Extraction timed out — try again or use the YouTube embed player in the app.' : 'Failed to extract video' },
      { status: timedOut ? 504 : 500 },
    );
  }
}
