import { NextRequest, NextResponse } from 'next/server';
import { getImpactPool } from '@/lib/impact-db-pool';

const ROW_ID = process.env.IMPACT_ROW_ID ?? 'impact-main';

export async function GET() {
  const pool = getImpactPool();
  if (!pool) {
    return NextResponse.json({ ok: false, reason: 'no_database_url' }, { status: 503 });
  }
  try {
    const { rows } = await pool.query(
      'select projects, themes, albums, grammy_goals, updated_at from impact_state where id = $1',
      [ROW_ID],
    );
    if (!rows.length) {
      return NextResponse.json({ ok: true, row: null });
    }
    const r = rows[0];
    return NextResponse.json({
      ok: true,
      row: {
        id: ROW_ID,
        projects: r.projects,
        themes: r.themes,
        albums: r.albums,
        grammy_goals: r.grammy_goals,
        updated_at: r.updated_at,
      },
    });
  } catch (e) {
    console.error('GET /api/impact-state failed', e);
    return NextResponse.json({ ok: false, error: 'db_read_failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const pool = getImpactPool();
  if (!pool) {
    return NextResponse.json({ ok: false, reason: 'no_database_url' }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      projects?: unknown;
      themes?: unknown;
      albums?: unknown;
      grammy_goals?: unknown;
    };
    const projects = Array.isArray(body.projects) ? body.projects : [];
    const themes = Array.isArray(body.themes) ? body.themes : [];
    const albums = Array.isArray(body.albums) ? body.albums : [];
    const grammy_goals = Array.isArray(body.grammy_goals) ? body.grammy_goals : [];

    await pool.query(
      `insert into impact_state (id, projects, themes, albums, grammy_goals, updated_at)
       values ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb, now())
       on conflict (id) do update set
         projects = excluded.projects,
         themes = excluded.themes,
         albums = excluded.albums,
         grammy_goals = excluded.grammy_goals,
         updated_at = now()`,
      [ROW_ID, JSON.stringify(projects), JSON.stringify(themes), JSON.stringify(albums), JSON.stringify(grammy_goals)],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/impact-state failed', e);
    return NextResponse.json({ ok: false, error: 'db_write_failed' }, { status: 500 });
  }
}
