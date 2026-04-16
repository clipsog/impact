"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Play,
  Pause,
  Music,
  Home,
  Trash2,
  Tag,
  CornerDownLeft,
  Repeat,
  ListMusic,
  Plus,
  ArrowLeft,
  Music2,
  Palette,
  Disc3,
  Target,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react';
import {
  type Theme,
  DEFAULT_THEMES,
  CHARACTER_FAMILIES,
  ART_DEVICES,
  SELL_FOCUS_OPTIONS,
  DEFAULT_GRAMMY_GOALS,
  type GrammyGoal,
} from '@/lib/impact-data';
import { extractYoutubeVideoId } from '@/lib/youtube';

type Bar = {
  id: string;
  text: string;
  themeId: string | null;
  characterFamilyId: string | null;
  characterTag: string | null;
  artDevice: string | null;
  sellFocus: string | null;
};

type Album = { id: string; name: string };

type Project = {
  id: string;
  title: string;
  youtubeUrl: string;
  bars: Bar[];
  updatedAt: number;
  loopStart?: number;
  loopEnd?: number;
  isLooping?: boolean;
  albumId: string | null;
  goalIds: string[];
  genre: string;
};

function migrateBar(raw: Record<string, unknown>): Bar {
  const themeId = (raw.themeId ?? raw.categoryId) as string | null | undefined;
  return {
    id: String(raw.id),
    text: String(raw.text ?? ''),
    themeId: themeId ?? null,
    characterFamilyId: (raw.characterFamilyId as string | null) ?? null,
    characterTag: (raw.characterTag as string | null) ?? null,
    artDevice: (raw.artDevice as string | null) ?? null,
    sellFocus: (raw.sellFocus as string | null) ?? null,
  };
}

function migrateProject(raw: Record<string, unknown>): Project {
  const bars = Array.isArray(raw.bars) ? raw.bars.map((b) => migrateBar(b as Record<string, unknown>)) : [];
  return {
    id: String(raw.id),
    title: String(raw.title ?? 'Untitled'),
    youtubeUrl: String(raw.youtubeUrl ?? ''),
    bars,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    loopStart: raw.loopStart !== undefined ? Number(raw.loopStart) : undefined,
    loopEnd: raw.loopEnd !== undefined ? Number(raw.loopEnd) : undefined,
    isLooping: Boolean(raw.isLooping),
    albumId: (raw.albumId as string | null) ?? null,
    goalIds: Array.isArray(raw.goalIds) ? (raw.goalIds as string[]) : [],
    genre: String(raw.genre ?? ''),
  };
}

const LS_PROJECTS = 'impact_projects';
const LS_THEMES = 'impact_themes';
const LS_CATEGORIES_LEGACY = 'impact_categories';
const LS_ALBUMS = 'impact_albums';
const LS_GOALS = 'impact_grammy_goals';

export default function ImpactApp() {
  const [activeTab, setActiveTab] = useState<'home' | 'project' | 'lyrics' | 'songs' | 'themes'>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [themes, setThemes] = useState<Theme[]>(DEFAULT_THEMES);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [grammyGoals, setGrammyGoals] = useState<GrammyGoal[]>(DEFAULT_GRAMMY_GOALS);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [lyricsThemeFilter, setLyricsThemeFilter] = useState<string | null>(null);
  const [expandedBarId, setExpandedBarId] = useState<string | null>(null);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [useEmbedPlayer, setUseEmbedPlayer] = useState(false);
  const [beatStreamError, setBeatStreamError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [songsGroupBy, setSongsGroupBy] = useState<'album' | 'goal' | 'genre'>('album');
  const [hydrated, setHydrated] = useState(false);

  const beatYoutubeId = useMemo(() => {
    const raw = currentProject?.youtubeUrl?.trim();
    return raw ? extractYoutubeVideoId(raw) : null;
  }, [currentProject?.youtubeUrl]);

  useEffect(() => {
    let cancelled = false;

    const loadFromLocal = () => {
      try {
        const savedProjects = localStorage.getItem(LS_PROJECTS);
        if (savedProjects) {
          const parsed = JSON.parse(savedProjects) as Record<string, unknown>[];
          setProjects(parsed.map((p) => migrateProject(p)));
        }
        let loadedThemes: Theme[] | null = null;
        const t = localStorage.getItem(LS_THEMES);
        if (t) loadedThemes = JSON.parse(t) as Theme[];
        else {
          const legacy = localStorage.getItem(LS_CATEGORIES_LEGACY);
          if (legacy) loadedThemes = JSON.parse(legacy) as Theme[];
        }
        if (loadedThemes?.length) setThemes(loadedThemes);
        const savedAlbums = localStorage.getItem(LS_ALBUMS);
        if (savedAlbums) setAlbums(JSON.parse(savedAlbums) as Album[]);
        const savedGoals = localStorage.getItem(LS_GOALS);
        if (savedGoals) {
          const g = JSON.parse(savedGoals) as GrammyGoal[];
          if (g.length) setGrammyGoals(g);
        }
      } catch {
        /* ignore */
      }
    };

    (async () => {
      try {
        const res = await fetch('/api/impact-state');
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            row?: {
              projects?: unknown;
              themes?: unknown;
              albums?: unknown;
              grammy_goals?: unknown;
            } | null;
          };
          if (data.ok && data.row) {
            const row = data.row;
            if (Array.isArray(row.projects)) {
              setProjects(row.projects.map((p) => migrateProject(p as Record<string, unknown>)));
            }
            if (Array.isArray(row.themes) && row.themes.length > 0) {
              setThemes(row.themes as Theme[]);
            }
            if (Array.isArray(row.albums)) {
              setAlbums(row.albums as Album[]);
            }
            if (Array.isArray(row.grammy_goals)) {
              if (row.grammy_goals.length > 0) setGrammyGoals(row.grammy_goals as GrammyGoal[]);
            }
            if (!cancelled) {
              setHydrated(true);
              return;
            }
          }
        }
      } catch {
        /* fall through to local */
      }
      if (!cancelled) {
        loadFromLocal();
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
  }, [projects, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_THEMES, JSON.stringify(themes));
  }, [themes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_ALBUMS, JSON.stringify(albums));
  }, [albums, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_GOALS, JSON.stringify(grammyGoals));
  }, [grammyGoals, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      fetch('/api/impact-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects,
          themes,
          albums,
          grammy_goals: grammyGoals,
        }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [projects, themes, albums, grammyGoals, hydrated]);

  useEffect(() => {
    const url = currentProject?.youtubeUrl?.trim();
    if (!currentProject || !url) {
      setPlayerUrl(null);
      setPlayerLoading(false);
      setUseEmbedPlayer(false);
      setBeatStreamError(false);
      setIsPlaying(false);
      return;
    }

    const ac = new AbortController();
    setPlayerLoading(true);
    setUseEmbedPlayer(false);
    setBeatStreamError(false);
    setPlayerUrl(null);
    setIsPlaying(false);

    fetch(`/api/youtube?url=${encodeURIComponent(url)}`, { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { streamUrl?: string; error?: string };
        if (!res.ok || !data.streamUrl) {
          throw new Error(data.error || 'no_stream');
        }
        setPlayerUrl(data.streamUrl);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setPlayerUrl(null);
        if (extractYoutubeVideoId(url)) setUseEmbedPlayer(true);
        else setBeatStreamError(true);
      })
      .finally(() => {
        if (!ac.signal.aborted) setPlayerLoading(false);
      });

    return () => ac.abort();
  }, [currentProject?.youtubeUrl]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        await el.play();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
      if (beatYoutubeId) {
        setUseEmbedPlayer(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      if (currentProject?.isLooping && currentProject.loopEnd && currentProject.loopStart !== undefined) {
        if (time >= currentProject.loopEnd) {
          audioRef.current.currentTime = currentProject.loopStart;
        }
      }
    }
  };

  const handleCreateProject = () => {
    const newProject: Project = {
      id: uuidv4(),
      title: 'Untitled Track',
      youtubeUrl: '',
      bars: [
        {
          id: uuidv4(),
          text: '',
          themeId: null,
          characterFamilyId: null,
          characterTag: null,
          artDevice: null,
          sellFocus: null,
        },
      ],
      updatedAt: Date.now(),
      albumId: null,
      goalIds: [],
      genre: '',
    };
    setProjects([newProject, ...projects]);
    setCurrentProject(newProject);
    setActiveTab('project');
  };

  const updateCurrentProject = (updates: Partial<Project>) => {
    if (!currentProject) return;
    const updated = { ...currentProject, ...updates, updatedAt: Date.now() };
    setCurrentProject(updated);
    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleBarChange = (id: string, text: string) => {
    if (!currentProject) return;
    const newBars = currentProject.bars.map((b) => (b.id === id ? { ...b, text } : b));
    updateCurrentProject({ bars: newBars });
  };

  const patchBar = (barId: string, patch: Partial<Bar>) => {
    if (!currentProject) return;
    const newBars = currentProject.bars.map((b) => (b.id === barId ? { ...b, ...patch } : b));
    updateCurrentProject({ bars: newBars });
  };

  const handleBarKeyDown = (e: React.KeyboardEvent, index: number, id: string) => {
    if (!currentProject) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const newBars = [...currentProject.bars];
      const target = e.target as HTMLInputElement;
      const cursorActive = target.selectionStart || 0;
      const currentText = newBars[index].text;
      const beforeStr = currentText.slice(0, cursorActive);
      const afterStr = currentText.slice(cursorActive);
      newBars[index].text = beforeStr;
      const newBar: Bar = {
        id: uuidv4(),
        text: afterStr,
        themeId: null,
        characterFamilyId: null,
        characterTag: null,
        artDevice: null,
        sellFocus: null,
      };
      newBars.splice(index + 1, 0, newBar);
      updateCurrentProject({ bars: newBars });
      setTimeout(() => {
        const inputs = document.querySelectorAll('.bar-input');
        if (inputs[index + 1]) (inputs[index + 1] as HTMLInputElement).focus();
      }, 10);
    }
    if (e.key === 'Backspace' && currentProject.bars[index].text === '' && currentProject.bars.length > 1) {
      e.preventDefault();
      const newBars = currentProject.bars.filter((_, i) => i !== index);
      updateCurrentProject({ bars: newBars });
      if (expandedBarId === id) setExpandedBarId(null);
      setTimeout(() => {
        const inputs = document.querySelectorAll('.bar-input');
        if (inputs[index - 1]) {
          const input = inputs[index - 1] as HTMLInputElement;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 10);
    }
  };

  const cycleTheme = (barId: string, currentThemeId: string | null) => {
    const currentIndex = themes.findIndex((c) => c.id === currentThemeId);
    const nextIndex = currentIndex + 1 >= themes.length ? -1 : currentIndex + 1;
    patchBar(barId, { themeId: nextIndex === -1 ? null : themes[nextIndex].id });
  };

  const deleteBar = (barId: string) => {
    if (!currentProject) return;
    if (currentProject.bars.length === 1) return;
    const newBars = currentProject.bars.filter((b) => b.id !== barId);
    updateCurrentProject({ bars: newBars });
    if (expandedBarId === barId) setExpandedBarId(null);
  };

  const toggleLoop = () => {
    if (!currentProject) return;
    updateCurrentProject({
      isLooping: !currentProject.isLooping,
      loopStart: currentProject.loopStart || 0,
      loopEnd: currentProject.loopEnd || duration,
    });
  };

  const setLoopPoints = () => {
    if (!currentProject) return;
    updateCurrentProject({
      loopStart: Math.max(0, currentTime),
      loopEnd: Math.min(duration, currentTime + 10),
      isLooping: true,
    });
  };

  const addTheme = () => {
    const colors = ['#ec4899', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#06b6d4', '#a855f7'];
    const next = themes.length % colors.length;
    setThemes([
      ...themes,
      { id: uuidv4(), name: 'New theme', color: colors[next] ?? '#8b5cf6' },
    ]);
  };

  const updateTheme = (id: string, name: string, color: string) => {
    setThemes(themes.map((t) => (t.id === id ? { ...t, name, color } : t)));
  };

  const deleteTheme = (id: string) => {
    if (themes.length <= 1) return;
    setThemes(themes.filter((t) => t.id !== id));
    setProjects(
      projects.map((p) => ({
        ...p,
        bars: p.bars.map((b) => (b.themeId === id ? { ...b, themeId: null } : b)),
      }))
    );
    if (currentProject) {
      setCurrentProject({
        ...currentProject,
        bars: currentProject.bars.map((b) => (b.themeId === id ? { ...b, themeId: null } : b)),
      });
    }
  };

  const addAlbum = () => {
    const a: Album = { id: uuidv4(), name: 'New album' };
    setAlbums([...albums, a]);
  };

  const updateAlbumName = (id: string, name: string) => {
    setAlbums(albums.map((a) => (a.id === id ? { ...a, name } : a)));
  };

  const deleteAlbum = (id: string) => {
    setAlbums(albums.filter((a) => a.id !== id));
    setProjects(
      projects.map((p) => (p.albumId === id ? { ...p, albumId: null } : p))
    );
    if (currentProject?.albumId === id) setCurrentProject({ ...currentProject, albumId: null });
  };

  const addCustomGoal = () => {
    setGrammyGoals([...grammyGoals, { id: uuidv4(), name: 'Custom goal' }]);
  };

  const updateGoalName = (id: string, name: string) => {
    setGrammyGoals(grammyGoals.map((g) => (g.id === id ? { ...g, name } : g)));
  };

  const lyricsSections = useMemo(() => {
    const list: { theme: Theme | null; items: { bar: Bar; projectTitle: string; projectId: string }[] }[] = [];
    const byTheme = new Map<string | 'none', { bar: Bar; projectTitle: string; projectId: string }[]>();
    projects.forEach((p) => {
      p.bars.forEach((b) => {
        if (!b.text.trim()) return;
        if (lyricsThemeFilter && b.themeId !== lyricsThemeFilter) return;
        const key = b.themeId ?? 'none';
        if (!byTheme.has(key)) byTheme.set(key, []);
        byTheme.get(key)!.push({ bar: b, projectTitle: p.title, projectId: p.id });
      });
    });
    themes.forEach((th) => {
      const items = byTheme.get(th.id);
      if (items?.length) list.push({ theme: th, items });
    });
    const unassigned = byTheme.get('none');
    if (unassigned?.length) list.push({ theme: null, items: unassigned });
    return list;
  }, [projects, themes, lyricsThemeFilter]);

  const songsGrouped = useMemo(() => {
    const map = new Map<string, Project[]>();
    if (songsGroupBy === 'album') {
      projects.forEach((p) => {
        const al = albums.find((a) => a.id === p.albumId);
        const key = al?.name ?? 'Unassigned album';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      });
    } else if (songsGroupBy === 'genre') {
      projects.forEach((p) => {
        const key = p.genre.trim() || 'Unspecified genre';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      });
    } else {
      grammyGoals.forEach((g) => {
        const withGoal = projects.filter((p) => p.goalIds.includes(g.id));
        if (withGoal.length) map.set(g.name, withGoal);
      });
      const noGoal = projects.filter(
        (p) => !p.goalIds.length || !p.goalIds.some((id) => grammyGoals.some((gg) => gg.id === id))
      );
      if (noGoal.length) map.set('No goal tagged', noGoal);
    }
    return map;
  }, [projects, albums, grammyGoals, songsGroupBy]);

  function characterLabel(familyId: string | null, tag: string | null) {
    if (!familyId || !tag) return null;
    const fam = CHARACTER_FAMILIES.find((f) => f.id === familyId);
    if (!fam) return tag;
    return `${fam.name.split(' / ')[0]} · ${tag}`;
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div>
          <h1 className="title" style={{ fontSize: '2.5rem', marginBottom: '0.2rem' }}>
            Impact
          </h1>
          <p className="subtitle" style={{ fontSize: '0.9rem', marginBottom: '0' }}>
            Master your art.
          </p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '2rem' }}>
          <button
            type="button"
            className={`category-item ${activeTab === 'home' ? 'active glass' : ''}`}
            onClick={() => setActiveTab('home')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Home size={20} /> Home
          </button>
          <button
            type="button"
            className={`category-item ${activeTab === 'lyrics' ? 'active glass' : ''}`}
            onClick={() => setActiveTab('lyrics')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <ListMusic size={20} /> Lyrics
          </button>
          <button
            type="button"
            className={`category-item ${activeTab === 'songs' ? 'active glass' : ''}`}
            onClick={() => setActiveTab('songs')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Disc3 size={20} /> Songs
          </button>
          <button
            type="button"
            className={`category-item ${activeTab === 'themes' ? 'active glass' : ''}`}
            onClick={() => setActiveTab('themes')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Palette size={20} /> Themes
          </button>
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}
          >
            <h3
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                margin: 0,
              }}
            >
              Themes
            </h3>
            <button
              type="button"
              className="btn-secondary btn-icon-only"
              title="Manage themes"
              onClick={() => setActiveTab('themes')}
            >
              <Pencil size={14} />
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Click to filter Lyrics; tag lines in the editor.
          </p>
          <div className="categories-list">
            <button
              type="button"
              className={`category-item ${lyricsThemeFilter === null ? 'active' : ''}`}
              onClick={() => {
                setLyricsThemeFilter(null);
                setActiveTab('lyrics');
              }}
              style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', width: '100%', textAlign: 'left' }}
            >
              All themes
            </button>
            {themes.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`category-item ${lyricsThemeFilter === th.id ? 'active' : ''}`}
                onClick={() => {
                  setLyricsThemeFilter(th.id);
                  setActiveTab('lyrics');
                }}
                style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', width: '100%', textAlign: 'left' }}
              >
                <div className="category-color" style={{ backgroundColor: th.color }} />
                <span>{th.name}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-content">
        {activeTab === 'home' && (
          <div>
            <div className="header-actions">
              <div>
                <h2 className="title" style={{ fontSize: '2rem' }}>
                  Recent Projects
                </h2>
                <p className="subtitle">Jump back in and start writing.</p>
              </div>
              <button type="button" className="btn" onClick={handleCreateProject}>
                <Plus size={20} /> New Track
              </button>
            </div>
            <div className="grid-cards">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="card glass"
                  onClick={() => {
                    setCurrentProject(proj);
                    setActiveTab('project');
                  }}
                  role="presentation"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 className="card-title">{proj.title}</h3>
                    <Music size={24} color="var(--accent-color)" />
                  </div>
                  <div className="card-meta">
                    {proj.bars.length} bars • {proj.genre ? `${proj.genre} • ` : ''}
                    Last updated {new Date(proj.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '4rem 0',
                  }}
                >
                  No tracks yet. Create your first hit!
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'lyrics' && (
          <div>
            <div className="header-actions">
              <div>
                <h2 className="title" style={{ fontSize: '2rem' }}>
                  Lyrics by theme
                </h2>
                <p className="subtitle">
                  Lines grouped by theme; character, art, and sell tags show as chips.
                  {lyricsThemeFilter && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginLeft: '1rem', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() => setLyricsThemeFilter(null)}
                    >
                      Clear filter
                    </button>
                  )}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              {lyricsSections.length === 0 && (
                <p style={{ color: 'var(--text-secondary)' }}>No tagged lines yet. Write bars and assign a theme.</p>
              )}
              {lyricsSections.map((section) => (
                <div key={section.theme?.id ?? 'none'}>
                  <h3
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '1rem',
                      fontSize: '1.25rem',
                    }}
                  >
                    {section.theme ? (
                      <>
                        <div
                          className="category-color"
                          style={{ backgroundColor: section.theme.color, width: '16px', height: '16px' }}
                        />
                        {section.theme.name} ({section.items.length})
                      </>
                    ) : (
                      <>Unthemed ({section.items.length})</>
                    )}
                  </h3>
                  <div
                    className="grid-cards"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}
                  >
                    {section.items.map((item, i) => (
                      <div key={`${item.projectId}-${item.bar.id}-${i}`} className="glass category-bar-card">
                        <div className="bar-content">&ldquo;{item.bar.text}&rdquo;</div>
                        <div className="bar-source">
                          <Music size={14} /> {item.projectTitle}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                          {characterLabel(item.bar.characterFamilyId, item.bar.characterTag) && (
                            <span className="tag" style={{ background: 'rgba(139, 92, 246, 0.35)', fontSize: '0.7rem' }}>
                              {characterLabel(item.bar.characterFamilyId, item.bar.characterTag)}
                            </span>
                          )}
                          {item.bar.artDevice && (
                            <span className="tag" style={{ background: 'rgba(16, 185, 129, 0.35)', fontSize: '0.7rem' }}>
                              Art: {item.bar.artDevice}
                            </span>
                          )}
                          {item.bar.sellFocus && (
                            <span className="tag" style={{ background: 'rgba(236, 72, 153, 0.35)', fontSize: '0.7rem' }}>
                              Sell: {item.bar.sellFocus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'songs' && (
          <div>
            <div className="header-actions">
              <div>
                <h2 className="title" style={{ fontSize: '2rem' }}>
                  Song classification
                </h2>
                <p className="subtitle">Albums, Grammy goals, and genre — organize every track.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Group by</span>
                {(['album', 'goal', 'genre'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`btn-secondary ${songsGroupBy === g ? '' : ''}`}
                    style={{
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.85rem',
                      borderColor: songsGroupBy === g ? 'var(--accent-color)' : undefined,
                    }}
                    onClick={() => setSongsGroupBy(g)}
                  >
                    {g === 'album' && <Disc3 size={14} style={{ marginRight: 6 }} />}
                    {g === 'goal' && <Target size={14} style={{ marginRight: 6 }} />}
                    {g === 'genre' && <Music size={14} style={{ marginRight: 6 }} />}
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Albums</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {albums.map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      value={a.name}
                      onChange={(e) => updateAlbumName(a.id, e.target.value)}
                      style={{ flex: 1, padding: '0.5rem 0.75rem' }}
                    />
                    <button type="button" className="btn-secondary btn-icon-only" onClick={() => deleteAlbum(a.id)}>
                      <Trash2 size={16} color="var(--danger)" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={addAlbum}>
                  <Plus size={16} /> Add album
                </button>
              </div>
            </div>

            <div className="glass" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Grammy goals (2027)</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Edit labels or add custom targets. Tag each song below.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {grammyGoals.map((g) => (
                  <div key={g.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      value={g.name}
                      onChange={(e) => updateGoalName(g.id, e.target.value)}
                      style={{ flex: 1, padding: '0.5rem 0.75rem' }}
                    />
                  </div>
                ))}
                <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={addCustomGoal}>
                  <Plus size={16} /> Add goal
                </button>
              </div>
            </div>

            {projects.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Create a track from Home to tag it here.</p>
            )}
            {Array.from(songsGrouped.entries()).map(([groupName, projs]) => (
              <div key={groupName} style={{ marginBottom: '2.5rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.15rem' }}>{groupName}</h3>
                <div className="grid-cards songs-project-grid">
                  {projs.map((proj) => (
                    <div key={proj.id} className="glass category-bar-card">
                      <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>{proj.title}</div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                        Album
                      </label>
                      <select
                        value={proj.albumId ?? ''}
                        onChange={(e) => {
                          const albumId = e.target.value || null;
                          setProjects(projects.map((p) => (p.id === proj.id ? { ...p, albumId, updatedAt: Date.now() } : p)));
                          if (currentProject?.id === proj.id) setCurrentProject({ ...currentProject, albumId });
                        }}
                        style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem' }}
                      >
                        <option value="">— None —</option>
                        {albums.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                        Genre
                      </label>
                      <input
                        value={proj.genre}
                        placeholder="e.g. R&B, rap"
                        onChange={(e) => {
                          const genre = e.target.value;
                          setProjects(projects.map((p) => (p.id === proj.id ? { ...p, genre, updatedAt: Date.now() } : p)));
                          if (currentProject?.id === proj.id) setCurrentProject({ ...currentProject, genre });
                        }}
                        style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem' }}
                      />
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Goals
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {grammyGoals.map((g) => (
                          <label
                            key={g.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={proj.goalIds.includes(g.id)}
                              onChange={() => {
                                const next = proj.goalIds.includes(g.id)
                                  ? proj.goalIds.filter((x) => x !== g.id)
                                  : [...proj.goalIds, g.id];
                                setProjects(
                                  projects.map((p) => (p.id === proj.id ? { ...p, goalIds: next, updatedAt: Date.now() } : p))
                                );
                                if (currentProject?.id === proj.id) setCurrentProject({ ...currentProject, goalIds: next });
                              }}
                            />
                            <span>{g.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'themes' && (
          <div>
            <div className="header-actions">
              <div>
                <h2 className="title" style={{ fontSize: '2rem' }}>
                  Themes
                </h2>
                <p className="subtitle">
                  Structural roles for lines (Hook, Verse, …). Add, rename, or recolor; bars reference these in the editor.
                </p>
              </div>
              <button type="button" className="btn" onClick={addTheme}>
                <Plus size={20} /> New theme
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px' }}>
              {themes.map((th) => (
                <div key={th.id} className="glass" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={th.color}
                    onChange={(e) => updateTheme(th.id, th.name, e.target.value)}
                    style={{ width: '48px', height: '40px', padding: 0, border: 'none', cursor: 'pointer' }}
                    title="Color"
                  />
                  <input
                    value={th.name}
                    onChange={(e) => updateTheme(th.id, e.target.value, th.color)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn-secondary btn-icon-only" onClick={() => deleteTheme(th.id)} disabled={themes.length <= 1}>
                    <Trash2 size={18} color="var(--danger)" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'project' && currentProject && (
          <div className="editor-container">
            <button
              type="button"
              className="btn-secondary"
              style={{
                width: 'fit-content',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                background: 'transparent',
                border: '1px solid var(--glass-border)',
                cursor: 'pointer',
                color: 'white',
              }}
              onClick={() => setActiveTab('home')}
            >
              <ArrowLeft size={16} /> Back
            </button>

            <div className="glass project-shell">
              <input
                type="text"
                value={currentProject.title}
                onChange={(e) => updateCurrentProject({ title: e.target.value })}
                className="project-title-input"
                style={{
                  fontWeight: 800,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  marginBottom: '1rem',
                  outline: 'none',
                }}
                placeholder="Track Title"
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }} className="song-meta-grid">
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Album</label>
                  <select
                    value={currentProject.albumId ?? ''}
                    onChange={(e) => updateCurrentProject({ albumId: e.target.value || null })}
                    style={{ width: '100%', marginTop: '0.25rem' }}
                  >
                    <option value="">— None —</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Genre</label>
                  <input
                    value={currentProject.genre}
                    onChange={(e) => updateCurrentProject({ genre: e.target.value })}
                    placeholder="Genre"
                    style={{ marginTop: '0.25rem' }}
                  />
                </div>
              </div>
              <details style={{ marginBottom: '1rem' }} className="glass" open>
                <summary style={{ cursor: 'pointer', padding: '0.75rem', fontWeight: 600 }}>
                  Grammy goals &middot; {currentProject.goalIds.length} selected
                </summary>
                <div style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {grammyGoals.map((g) => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={currentProject.goalIds.includes(g.id)}
                        onChange={() => {
                          const next = currentProject.goalIds.includes(g.id)
                            ? currentProject.goalIds.filter((x) => x !== g.id)
                            : [...currentProject.goalIds, g.id];
                          updateCurrentProject({ goalIds: next });
                        }}
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </details>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  value={currentProject.youtubeUrl}
                  onChange={(e) => updateCurrentProject({ youtubeUrl: e.target.value })}
                  placeholder="Paste YouTube Beat URL here..."
                  style={{ flex: 1 }}
                />
              </div>

              {currentProject.youtubeUrl && (
                <div className="player-section glass">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Music2 size={20} color="var(--accent-color)" />
                      <span style={{ fontWeight: 600 }}>Beat Player</span>
                    </div>
                    {playerLoading && (
                      <span className="tag" style={{ background: 'rgba(148, 163, 184, 0.35)' }}>
                        Loading…
                      </span>
                    )}
                    {!playerLoading && useEmbedPlayer && beatYoutubeId && (
                      <span className="tag" style={{ background: 'var(--success)' }}>YouTube</span>
                    )}
                    {!playerLoading && !useEmbedPlayer && playerUrl && (
                      <span className="tag" style={{ background: 'var(--success)' }}>Ready</span>
                    )}
                  </div>
                  {beatStreamError && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>
                      Could not load a stream for this link. Use a normal YouTube watch URL (or youtu.be) and try again.
                    </p>
                  )}
                  {useEmbedPlayer && beatYoutubeId && (
                    <div className="youtube-embed-wrap">
                      <iframe
                        title="YouTube beat"
                        src={`https://www.youtube.com/embed/${beatYoutubeId}?playsinline=1&rel=0`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Playback here uses YouTube&rsquo;s player (tap play inside the frame). Built-in loop controls only affect the separate audio stream when your browser can play it.
                      </p>
                    </div>
                  )}
                  {playerUrl && !useEmbedPlayer && (
                    <audio
                      ref={audioRef}
                      src={playerUrl}
                      playsInline
                      preload="metadata"
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                      onEnded={() => setIsPlaying(false)}
                      onError={() => {
                        setIsPlaying(false);
                        if (beatYoutubeId) setUseEmbedPlayer(true);
                      }}
                    />
                  )}
                  <div className="player-controls">
                    <button
                      type="button"
                      className="btn btn-icon-only"
                      onClick={togglePlay}
                      disabled={!playerUrl || useEmbedPlayer || playerLoading}
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <div className="progress-container">
                      <div
                        className="progress-bar"
                        onPointerDown={(e) => {
                          if (!audioRef.current || !duration || useEmbedPlayer) return;
                          const el = e.currentTarget;
                          const rect = el.getBoundingClientRect();
                          const pos = (e.clientX - rect.left) / rect.width;
                          audioRef.current.currentTime = Math.min(1, Math.max(0, pos)) * duration;
                        }}
                        role="presentation"
                      >
                        <div className="progress-fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
                        {currentProject.isLooping &&
                          currentProject.loopStart !== undefined &&
                          currentProject.loopEnd !== undefined &&
                          duration > 0 && (
                            <>
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '-4px',
                                  bottom: '-4px',
                                  width: '2px',
                                  background: 'var(--accent-secondary)',
                                  left: `${(currentProject.loopStart / duration) * 100}%`,
                                }}
                              />
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '-4px',
                                  bottom: '-4px',
                                  width: '2px',
                                  background: 'var(--accent-secondary)',
                                  left: `${(currentProject.loopEnd / duration) * 100}%`,
                                }}
                              />
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '0',
                                  bottom: '0',
                                  background: 'rgba(236, 72, 153, 0.2)',
                                  left: `${(currentProject.loopStart / duration) * 100}%`,
                                  width: `${((currentProject.loopEnd - currentProject.loopStart) / duration) * 100}%`,
                                }}
                              />
                            </>
                          )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>
                          {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                        </span>
                        <span>
                          {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                    <div className="loop-controls">
                      <button
                        type="button"
                        onClick={toggleLoop}
                        className="btn-secondary btn-icon-only"
                        style={{
                          border: 'none',
                          color: currentProject.isLooping ? 'var(--accent-secondary)' : 'var(--text-secondary)',
                        }}
                        title="Toggle Loop"
                      >
                        <Repeat size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={setLoopPoints}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        title="Set loop to current time + 10s"
                      >
                        Set Loop Range
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="lyrics-container glass">
              <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CornerDownLeft size={20} color="var(--accent-color)" /> Bars &amp; lyric tags
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Theme = structure. Open &ldquo;Line tags&rdquo; for character, art (device), and what you&rsquo;re selling.
              </p>

              {currentProject.bars.map((bar, index) => {
                const activeTheme = themes.find((c) => c.id === bar.themeId);
                const fam = CHARACTER_FAMILIES.find((f) => f.id === bar.characterFamilyId);
                const expanded = expandedBarId === bar.id;

                return (
                  <div key={bar.id}>
                    <div className="bar-row">
                      <div className="bar-number">{index + 1}</div>
                      <div className="bar-input-container">
                        <input
                          type="text"
                          className="bar-input"
                          value={bar.text}
                          onChange={(e) => handleBarChange(bar.id, e.target.value)}
                          onKeyDown={(e) => handleBarKeyDown(e, index, bar.id)}
                          placeholder={index === 0 ? 'Type your first bar and press Enter...' : ''}
                          autoFocus={index === currentProject.bars.length - 1 && currentProject.bars.length > 1}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginLeft: '0.5rem', marginTop: '0.25rem' }}>
                          {activeTheme && (
                            <div className="category-badge" style={{ backgroundColor: activeTheme.color }}>
                              {activeTheme.name}
                            </div>
                          )}
                          {fam && bar.characterTag && (
                            <span className="tag" style={{ background: 'rgba(139, 92, 246, 0.4)', fontSize: '0.7rem' }}>
                              {fam.name.split(' / ')[0]} · {bar.characterTag}
                            </span>
                          )}
                          {bar.artDevice && (
                            <span className="tag" style={{ background: 'rgba(16, 185, 129, 0.4)', fontSize: '0.7rem' }}>
                              {bar.artDevice}
                            </span>
                          )}
                          {bar.sellFocus && (
                            <span className="tag" style={{ background: 'rgba(236, 72, 153, 0.4)', fontSize: '0.7rem' }}>
                              Sell: {bar.sellFocus}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="bar-actions">
                        <button
                          type="button"
                          className="btn-icon-only btn-secondary"
                          onClick={() => cycleTheme(bar.id, bar.themeId)}
                          title="Cycle theme"
                        >
                          <Tag size={16} color={activeTheme ? activeTheme.color : 'white'} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon-only btn-secondary"
                          onClick={() => setExpandedBarId(expanded ? null : bar.id)}
                          title="Line tags: character, art, sell"
                        >
                          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          type="button"
                          className="btn-icon-only btn-secondary"
                          onClick={() => deleteBar(bar.id)}
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="glass bar-expand-panel">
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Theme</label>
                          <select
                            value={bar.themeId ?? ''}
                            onChange={(e) => patchBar(bar.id, { themeId: e.target.value || null })}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                          >
                            <option value="">— None —</option>
                            {themes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Character family</label>
                          <select
                            value={bar.characterFamilyId ?? ''}
                            onChange={(e) => {
                              const id = e.target.value || null;
                              patchBar(bar.id, {
                                characterFamilyId: id,
                                characterTag: null,
                              });
                            }}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                          >
                            <option value="">— None —</option>
                            {CHARACTER_FAMILIES.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Character tag</label>
                          <select
                            value={bar.characterTag ?? ''}
                            onChange={(e) => patchBar(bar.id, { characterTag: e.target.value || null })}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                            disabled={!bar.characterFamilyId}
                          >
                            <option value="">— Pick tag —</option>
                            {(CHARACTER_FAMILIES.find((f) => f.id === bar.characterFamilyId)?.tags ?? []).map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Art (device)</label>
                          <select
                            value={bar.artDevice ?? ''}
                            onChange={(e) => patchBar(bar.id, { artDevice: e.target.value || null })}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                          >
                            <option value="">— None —</option>
                            {ART_DEVICES.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>What you&rsquo;re selling</label>
                          <select
                            value={bar.sellFocus ?? ''}
                            onChange={(e) => patchBar(bar.id, { sellFocus: e.target.value || null })}
                            style={{ width: '100%', marginTop: '0.25rem' }}
                          >
                            <option value="">— None —</option>
                            {SELL_FOCUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
