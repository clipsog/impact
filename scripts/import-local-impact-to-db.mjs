#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

const INPUT = process.argv[2] ?? 'scripts/impact-local-export.json';
const ROW_ID = process.env.IMPACT_ROW_ID ?? 'impact-main';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL env var.');
  process.exit(1);
}

const resolveInput = path.isAbsolute(INPUT) ? INPUT : path.resolve(process.cwd(), INPUT);
if (!fs.existsSync(resolveInput)) {
  console.error(`Input file not found: ${resolveInput}`);
  process.exit(1);
}

const raw = fs.readFileSync(resolveInput, 'utf8');
const parsed = JSON.parse(raw);

const readArray = (key) => {
  const val = parsed[key];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

const projects = readArray('impact_projects');
const themes = readArray('impact_themes');
const albums = readArray('impact_albums');
const goals = readArray('impact_grammy_goals');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS impact_state (
      id text PRIMARY KEY,
      projects jsonb NOT NULL DEFAULT '[]'::jsonb,
      themes jsonb NOT NULL DEFAULT '[]'::jsonb,
      albums jsonb NOT NULL DEFAULT '[]'::jsonb,
      grammy_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await pool.query(
    `INSERT INTO impact_state (id, projects, themes, albums, grammy_goals, updated_at)
     VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       projects = EXCLUDED.projects,
       themes = EXCLUDED.themes,
       albums = EXCLUDED.albums,
       grammy_goals = EXCLUDED.grammy_goals,
       updated_at = now()`,
    [ROW_ID, JSON.stringify(projects), JSON.stringify(themes), JSON.stringify(albums), JSON.stringify(goals)],
  );

  const countBars = projects.reduce((n, p) => n + (Array.isArray(p?.bars) ? p.bars.length : 0), 0);
  console.log('Imported to impact_state:', {
    rowId: ROW_ID,
    projects: projects.length,
    bars: countBars,
    themes: themes.length,
    albums: albums.length,
    goals: goals.length,
  });
}

run()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
