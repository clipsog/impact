import { NextRequest, NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { extractYoutubeVideoId } from '@/lib/youtube';
import { getYoutubeDlExec } from '@/lib/youtube-dl-exec';

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

function payloadFromDump(output: Record<string, unknown>): BeatPayload | null {
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

async function tryYtdlCore(url: string): Promise<BeatPayload | null> {
  try {
    const info = await ytdl.getInfo(url, {
      // Hosted / datacenter IPs often fail with the default WEB client; rotate clients.
      playerClients: ['WEB_EMBEDDED', 'IOS', 'ANDROID', 'WEB'],
    });
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
  } catch (e) {
    console.warn('[youtube] ytdl-core failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function tryYtDlp(url: string): Promise<BeatPayload | null> {
  const format =
    'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio[protocol^=https]/bestaudio/best';
  try {
    const output = (await getYoutubeDlExec()(
      url,
      {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        referer: 'https://www.youtube.com/',
        format,
      },
      { timeout: 45_000 },
    )) as Record<string, unknown>;
    return payloadFromDump(output);
  } catch (e) {
    console.warn('[youtube] yt-dlp failed:', e instanceof Error ? e.message : e);
    return null;
  }
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
