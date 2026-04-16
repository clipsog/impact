import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  
  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const cwd = process.cwd();
    const command = `./node_modules/youtube-dl-exec/bin/yt-dlp "${url}" --dump-single-json --no-warnings --no-check-certificate --prefer-free-formats --referer "https://www.youtube.com/" --format "bestaudio/best"`;
    
    const { stdout } = await execAsync(command, { cwd, maxBuffer: 1024 * 1024 * 10 });
    const output = JSON.parse(stdout);

    const streamUrl = output.url || (output.requested_downloads && output.requested_downloads[0]?.url) || output.entries?.[0]?.url;

    if (!streamUrl) {
      throw new Error('No stream URL found');
    }

    return NextResponse.json({ 
      title: output.title || output.entries?.[0]?.title || 'Unknown Title',
      streamUrl: streamUrl,
      lengthSeconds: output.duration || output.entries?.[0]?.duration || 0
    });
  } catch (error: any) {
    console.error("Exec Error: ", error.message || error);
    return NextResponse.json({ error: 'Failed to extract video' }, { status: 500 });
  }
}
