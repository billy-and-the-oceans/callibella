import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CompilerView, { type ViewMode } from './views/CompilerView';
import LibraryView from './views/LibraryView';
import NewView from './views/NewView';
import PracticeView from './views/PracticeView';
import ReviewView from './views/ReviewView';
import SettingsView from './views/SettingsView';
import { UpdateProvider } from './components/update/UpdateContext';
import type {
  AudioModelStatus,
  InteractiveDoc,
  LlmProviderConfig,
  LlmProviderPreset,
  Script,
  Story,
  StoryTranslation,
  TranslationJob,
} from './bokaTypes';
import { start_mock_translation } from './mockTranslation';
import { start_tauri_translation } from './tauriTranslation';
import { ensureAudioContext, playBase64Wav, stop as stopAudio } from './audioPlayer';
import { generate_speech, get_audio_status, preload_model } from './tauriAudio';
import { generate_mock_speech, get_mock_audio_status } from './mockAudio';

type ViewId = 'new' | 'compiler' | 'library' | 'practice' | 'review' | 'settings';

function migrateCategory(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const map: Record<string, string> = {
    'daily-life': 'Daily Life',
    'conflict': 'Conflict',
    'reflection': 'Reflection',
  };
  return map[value] ?? value;
}

export default function App() {
  const [view, setView] = useState<ViewId>('new');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [contentFilterEnabled, setContentFilterEnabled] = useState(true);

  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [denseSpans, setDenseSpans] = useState(false);
  const [provider, setProvider] = useState<LlmProviderConfig>({ preset: 'anthropic' });

  const [storyTitle, setStoryTitle] = useState('');
  const [storyText, setStoryText] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [compilerMode, setCompilerMode] = useState<ViewMode>('expanded');

  const [activeDocTitle, setActiveDocTitle] = useState('Untitled');

  const [job, setJob] = useState<TranslationJob | null>(null);
  const [doc, setDoc] = useState<InteractiveDoc | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [cancelTranslation, setCancelTranslation] = useState<(() => void) | null>(null);

  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeStoryLanguage, setActiveStoryLanguage] = useState<string | null>(null);

  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioModelStatus>({
    downloaded: false,
    loading: false,
    ready: false,
    modelSizeBytes: null,
    error: null,
  });
  const [cancelAudio, setCancelAudio] = useState<(() => void) | null>(null);

  const [stories, setStories] = useState<Story[]>(() => {
    try {
      const raw = localStorage.getItem('boka.stories');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .map((s: any) => {
            if (!s || typeof s !== 'object') return null;
            if (typeof s.id !== 'string') return null;
            if (typeof s.title !== 'string') return null;
            if (typeof s.createdAt !== 'number') return null;
            if (typeof s.updatedAt !== 'number') return null;
            if (typeof s.sourceText !== 'string') return null;
            if (typeof s.translations !== 'object' || !s.translations) return null;

            const story: Story = {
              id: s.id,
              title: s.title,
              category: migrateCategory(s.category ?? s.archetypeId),
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
              sourceText: s.sourceText,
              sourceLanguage: typeof s.sourceLanguage === 'string' ? s.sourceLanguage : 'en',
              translations: s.translations as Record<string, StoryTranslation>,
            };
            return story;
          })
          .filter(Boolean) as Story[];
      }
    } catch {}

    try {
      const raw = localStorage.getItem('boka.scripts');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const legacyScripts: Script[] = parsed
        .map((s: any) => {
          if (!s || typeof s !== 'object') return null;
          if (typeof s.id !== 'string') return null;
          if (!s.doc || typeof s.doc !== 'object') return null;
          if (!Array.isArray(s.doc.tokens) || typeof s.doc.spans !== 'object') return null;

          const script: Script = {
            id: s.id,
            title: typeof s.title === 'string' ? s.title : 'Untitled',
            category: migrateCategory(s.category ?? s.archetypeId),
            createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
            job: s.job && typeof s.job === 'object' ? (s.job as TranslationJob) : null,
            doc: s.doc as InteractiveDoc,
          };

          return script;
        })
        .filter(Boolean) as Script[];

      return legacyScripts.map((script) => {
        const lang = 'unknown';
        const t: StoryTranslation = {
          language: lang,
          createdAt: script.createdAt,
          job: script.job,
          doc: script.doc,
          errorMessage: null,
        };
        const story: Story = {
          id: `legacy-${script.id}`,
          title: script.title,
          category: script.category,
          createdAt: script.createdAt,
          updatedAt: script.createdAt,
          sourceText: '',
          sourceLanguage: 'en',
          translations: {
            [lang]: t,
          },
        };
        return story;
      });
    } catch {
      return [];
    }
  });

  const allCategories = useMemo(() => {
    const defaults = ['Daily Life', 'Travel', 'Work', 'Childhood', 'Food & Dining', 'Conflict', 'Reflection'];
    const fromStories = stories.map((s) => s.category).filter((c): c is string => c != null);
    return [...new Set([...defaults, ...fromStories])].sort();
  }, [stories]);

  const handleSetCategory = useCallback((storyId: string, cat: string | null) => {
    setStories((prev) =>
      prev.map((st) => st.id === storyId ? { ...st, category: cat, updatedAt: Date.now() } : st),
    );
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('boka.draft');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.storyTitle === 'string') setStoryTitle(parsed.storyTitle);
      if (typeof parsed.storyText === 'string') setStoryText(parsed.storyText);
      if (typeof parsed.category === 'string') setCategory(migrateCategory(parsed.category));
      else if (typeof parsed.archetypeId === 'string') setCategory(migrateCategory(parsed.archetypeId));
      else if (parsed.category === null || parsed.archetypeId === null) setCategory(null);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('boka.settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.targetLanguage === 'string') setTargetLanguage(parsed.targetLanguage);
      if (typeof parsed.sourceLanguage === 'string') setSourceLanguage(parsed.sourceLanguage);
      if (typeof parsed.denseSpans === 'boolean') setDenseSpans(parsed.denseSpans);
      const preset: LlmProviderPreset | null =
        typeof parsed.providerPreset === 'string' ? (parsed.providerPreset as LlmProviderPreset) : null;

      if (preset) {
        setProvider({
          preset,
          apiKey: typeof parsed.providerApiKey === 'string' ? parsed.providerApiKey : undefined,
          baseUrl: typeof parsed.providerBaseUrl === 'string' ? parsed.providerBaseUrl : undefined,
          model: typeof parsed.providerModel === 'string' ? parsed.providerModel : undefined,
        });
      } else if (typeof parsed.anthropicKey === 'string') {
        setProvider({ preset: 'anthropic', apiKey: parsed.anthropicKey });
      }
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'boka.settings',
        JSON.stringify({
          targetLanguage,
          sourceLanguage,
          denseSpans,
          providerPreset: provider.preset,
          providerApiKey: provider.apiKey ?? '',
          providerBaseUrl: provider.baseUrl ?? '',
          providerModel: provider.model ?? '',
        }),
      );
    } catch {}
  }, [denseSpans, provider, sourceLanguage, targetLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem('boka.stories', JSON.stringify(stories));
    } catch {}
  }, [stories]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'boka.draft',
        JSON.stringify({ storyTitle, storyText, category }),
      );
    } catch {}
  }, [storyTitle, storyText, category]);

  useEffect(() => {
    if (!contentFilterEnabled) return;
    setDoc((prev) => {
      if (!prev) return prev;
      let changed = false;
      const nextSpans: typeof prev.spans = { ...prev.spans };

      for (const [spanId, span] of Object.entries(prev.spans)) {
        const active = span.variants[span.activeVariantIndex];
        if (active?.register !== 'vulgar') continue;
        const nextIndex = span.variants.findIndex((v) => v.register !== 'vulgar');
        if (nextIndex < 0) continue;
        nextSpans[spanId] = { ...span, activeVariantIndex: nextIndex };
        changed = true;
      }

      if (!changed) return prev;
      return {
        ...prev,
        spans: nextSpans,
      };
    });
  }, [contentFilterEnabled]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await get_audio_status();
        if (!cancelled) setAudioStatus(status);
      } catch {
        if (!cancelled) setAudioStatus(get_mock_audio_status());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSpeak = useCallback(
    (text: string, language: string) => {
      cancelAudio?.();
      stopAudio();
      setIsAudioPlaying(true);
      ensureAudioContext();

      const callbacks = {
        text,
        language,
        speed: audioSpeed,
        onProgress: () => {},
        onReady: (ev: { audioBase64: string }) => {
          if (ev.audioBase64) {
            playBase64Wav(ev.audioBase64)
              .then(() => setIsAudioPlaying(false))
              .catch(() => setIsAudioPlaying(false));
          } else {
            setIsAudioPlaying(false);
          }
        },
        onError: (msg: string) => {
          console.warn('[boka] audio error:', msg);
          setIsAudioPlaying(false);
        },
      };

      (async () => {
        try {
          const handle = await generate_speech({
            ...callbacks,
            voiceId: undefined,
          });
          setCancelAudio(() => handle.cancel);
        } catch {
          const handle = generate_mock_speech(callbacks);
          setCancelAudio(() => handle.cancel);
        }
      })();
    },
    [audioSpeed, cancelAudio],
  );

  function makeTranslationCallbacks(storyId: string, language: string, now: number) {
    return {
      onJob: (incoming: TranslationJob) => {
        setJob(incoming);
        setStories((prev) =>
          prev.map((st) => {
            if (st.id !== storyId) return st;
            const prevT = st.translations[language];
            return {
              ...st,
              updatedAt: Date.now(),
              translations: {
                ...st.translations,
                [language]: { language, createdAt: prevT?.createdAt ?? now, job: incoming, doc: prevT?.doc ?? null, errorMessage: prevT?.errorMessage ?? null },
              },
            };
          }),
        );
      },
      onDoc: (incoming: InteractiveDoc) => {
        setDoc((prev) => {
          if (!prev) return incoming;
          const nextSpans: typeof incoming.spans = { ...incoming.spans };
          for (const [spanId, nextSpan] of Object.entries(incoming.spans)) {
            const prevSpan = prev.spans[spanId];
            if (!prevSpan) continue;
            nextSpans[spanId] = { ...nextSpan, activeVariantIndex: prevSpan.activeVariantIndex };
          }
          const nextDoc: InteractiveDoc = { ...incoming, spans: nextSpans };
          setStories((prevStories) =>
            prevStories.map((st) => {
              if (st.id !== storyId) return st;
              const prevT = st.translations[language];
              return {
                ...st,
                updatedAt: Date.now(),
                translations: {
                  ...st.translations,
                  [language]: { language, createdAt: prevT?.createdAt ?? now, job: prevT?.job ?? null, doc: nextDoc, errorMessage: prevT?.errorMessage ?? null },
                },
              };
            }),
          );
          return nextDoc;
        });
      },
      onError: (message: string) => {
        setTranslationError(message);
        setStories((prev) =>
          prev.map((st) => {
            if (st.id !== storyId) return st;
            const prevT = st.translations[language];
            return {
              ...st,
              updatedAt: Date.now(),
              translations: {
                ...st.translations,
                [language]: { language, createdAt: prevT?.createdAt ?? now, job: prevT?.job ?? null, doc: prevT?.doc ?? null, errorMessage: message },
              },
            };
          }),
        );
      },
    };
  }

  function startTranslation(storyId: string, language: string, sourceText: string, storySrcLang?: string) {
    const adultMode = !contentFilterEnabled;
    const now = Date.now();
    const cbs = makeTranslationCallbacks(storyId, language, now);

    const start = async () => {
      try {
        const handle = await start_tauri_translation({
          storyText: sourceText,
          targetLanguage: language,
          sourceLanguage: storySrcLang ?? sourceLanguage,
          adultMode,
          denseSpans,
          provider,
          ...cbs,
        });
        setCancelTranslation(() => handle.cancel);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[boka] tauri translation failed:', e);
        cbs.onError(`TAURI FAILED: ${msg}`);

        if (msg.includes('Not running in Tauri runtime')) {
          const handle = start_mock_translation({
            storyText: sourceText,
            onJob: cbs.onJob,
            onDoc: (incoming) => {
              setDoc(incoming);
              if (!incoming) return;
              setStories((prev) =>
                prev.map((st) => {
                  if (st.id !== storyId) return st;
                  const prevT = st.translations[language];
                  return {
                    ...st,
                    updatedAt: Date.now(),
                    translations: {
                      ...st.translations,
                      [language]: { language, createdAt: prevT?.createdAt ?? now, job: prevT?.job ?? null, doc: incoming, errorMessage: null },
                    },
                  };
                }),
              );
            },
          });
          setCancelTranslation(() => handle.cancel);
        }
      }
    };

    void start();
  }

  function handleOpenInLanguage(storyId: string, language: string) {
    const st = stories.find((x) => x.id === storyId);
    if (!st) return;

    cancelTranslation?.();
    setCancelTranslation(null);
    setSelectedSpanId(null);
    setActiveStoryId(storyId);
    setActiveStoryLanguage(language);
    setActiveDocTitle(st.title);

    // "original" is a pseudo-language meaning show the source text as-is
    if (language === 'original') {
      setJob(null);
      setDoc(null);
      setTranslationError(null);
      setCompilerMode('expanded');
      setView('compiler');
      return;
    }

    const translation = st.translations[language];
    if (translation) {
      setJob(translation.job);
      setDoc(translation.doc);
      setTranslationError(translation.errorMessage ?? null);
      setCompilerMode('interactive');
      setView('compiler');
    } else {
      setJob(null);
      setDoc(null);
      setTranslationError(null);
      const now = Date.now();
      setStories((prev) =>
        prev.map((s) => {
          if (s.id !== storyId) return s;
          return {
            ...s,
            updatedAt: now,
            translations: {
              ...s.translations,
              [language]: { language, createdAt: now, job: null, doc: null, errorMessage: null },
            },
          };
        }),
      );
      startTranslation(storyId, language, st.sourceText, st.sourceLanguage);
      setCompilerMode('expanded');
      setView('compiler');
    }
  }

  const activeStory = stories.find((s) => s.id === activeStoryId);
  const activeStoryTranslations = activeStory?.translations ?? {};

  const draftTitle = useMemo(() => {
    const t = storyTitle.trim();
    if (t) return t;
    const s = storyText.trim();
    if (!s) return 'Untitled';
    return s.slice(0, 50);
  }, [storyText, storyTitle]);

  const compilerTitle = view === 'compiler' ? activeDocTitle : draftTitle;

  function renderSurface() {
    if (view === 'new') {
      return (
        <NewView
          storyTitle={storyTitle}
          setStoryTitle={setStoryTitle}
          storyText={storyText}
          setStoryText={setStoryText}
          category={category}
          setCategory={setCategory}
          allCategories={allCategories}
          onTranslate={() => {
            cancelTranslation?.();
            setCancelTranslation(null);
            setJob(null);
            setDoc(null);
            setTranslationError(null);
            setSelectedSpanId(null);

            const storyId = `story-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
            const language = targetLanguage;
            const now = Date.now();

            const nextStory: Story = {
              id: storyId,
              title: draftTitle,
              category,
              createdAt: now,
              updatedAt: now,
              sourceText: storyText,
              sourceLanguage,
              translations: {
                [language]: { language, createdAt: now, job: null, doc: null, errorMessage: null },
              },
            };
            setStories((prev) => [nextStory, ...prev]);
            setActiveStoryId(storyId);
            setActiveStoryLanguage(language);
            setActiveDocTitle(draftTitle);

            startTranslation(storyId, language, storyText);

            setStoryText('');
            setStoryTitle('');
            setCategory(null);

            setCompilerMode('expanded');
            setView('compiler');
          }}
        />
      );
    }

    if (view === 'compiler') {
      return (
        <CompilerView
          title={activeDocTitle}
          sourceText={activeStory?.sourceText ?? ''}
          sourceLanguage={activeStory?.sourceLanguage ?? 'en'}
          onSetTitle={(t) => {
            setActiveDocTitle(t);
            if (activeStoryId) {
              setStories((prev) =>
                prev.map((st) => (st.id === activeStoryId ? { ...st, title: t, updatedAt: Date.now() } : st)),
              );
            }
          }}
          mode={compilerMode}
          setMode={setCompilerMode}
          job={job}
          doc={doc}
          errorMessage={translationError}
          contentFilterEnabled={contentFilterEnabled}
          selectedSpanId={selectedSpanId}
          onSelectSpan={(spanId) => setSelectedSpanId((prev) => (prev === spanId ? null : spanId))}
          onSpeak={handleSpeak}
          isAudioPlaying={isAudioPlaying}
          activeLanguage={activeStoryLanguage}
          onSetActiveVariant={(spanId: string, variantIndex: number) => {
            setDoc((prev) => {
              if (!prev) return prev;
              const span = prev.spans[spanId];
              if (!span) return prev;
              const nextSpan = { ...span, activeVariantIndex: variantIndex };
              const nextDoc: InteractiveDoc = {
                ...prev,
                spans: {
                  ...prev.spans,
                  [spanId]: nextSpan,
                },
              };
              const storyId = activeStoryId;
              const language = activeStoryLanguage;
              if (storyId && language) {
                setStories((prevStories) =>
                  prevStories.map((st) => {
                    if (st.id !== storyId) return st;
                    const prevT = st.translations[language];
                    if (!prevT) return st;
                    const nextT: StoryTranslation = {
                      ...prevT,
                      doc: nextDoc,
                    };
                    return {
                      ...st,
                      updatedAt: Date.now(),
                      translations: {
                        ...st.translations,
                        [language]: nextT,
                      },
                    };
                  }),
                );
              }
              return nextDoc;
            });
          }}
          storyTranslations={activeStoryTranslations}
          onSwitchLanguage={(language) => {
            if (activeStoryId) handleOpenInLanguage(activeStoryId, language);
          }}
          category={activeStory?.category ?? null}
          allCategories={allCategories}
          onSetCategory={(cat) => {
            if (activeStoryId) handleSetCategory(activeStoryId, cat);
          }}
        />
      );
    }

    if (view === 'library') {
      return (
        <LibraryView
          stories={stories}
          targetLanguage={targetLanguage}
          onOpen={handleOpenInLanguage}
          allCategories={allCategories}
          onSetCategory={handleSetCategory}
          onDelete={(id) => {
            setStories((prev) => prev.filter((s) => s.id !== id));
            if (activeStoryId === id) {
              cancelTranslation?.();
              setCancelTranslation(null);
              setJob(null);
              setDoc(null);
              setTranslationError(null);
              setSelectedSpanId(null);
              setActiveStoryId(null);
              setActiveStoryLanguage(null);
              setActiveDocTitle('Untitled');
            }
          }}
        />
      );
    }
    if (view === 'practice') return <PracticeView stories={stories} onSpeak={handleSpeak} isAudioPlaying={isAudioPlaying} audioSpeed={audioSpeed} setAudioSpeed={setAudioSpeed} />;
    if (view === 'review') return <ReviewView stories={stories} contentFilterEnabled={contentFilterEnabled} onSpeak={handleSpeak} isAudioPlaying={isAudioPlaying} />;

    return (
      <SettingsView
        theme={theme}
        setTheme={setTheme}
        contentFilterEnabled={contentFilterEnabled}
        setContentFilterEnabled={setContentFilterEnabled}
        targetLanguage={targetLanguage}
        setTargetLanguage={setTargetLanguage}
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
        denseSpans={denseSpans}
        setDenseSpans={setDenseSpans}
        provider={provider}
        setProvider={setProvider}
        audioStatus={audioStatus}
        audioSpeed={audioSpeed}
        setAudioSpeed={setAudioSpeed}
        onDownloadModel={() => {
          setAudioStatus((prev) => ({ ...prev, loading: true, error: null }));
          preload_model()
            .then(() => get_audio_status())
            .then((status) => setAudioStatus(status))
            .catch((e) => {
              const msg = e instanceof Error ? e.message : String(e);
              setAudioStatus((prev) => ({ ...prev, loading: false, error: msg }));
            });
        }}
      />
    );
  }

  const navItems: Array<{ id: ViewId; label: string }> = [
    { id: 'new', label: 'NEW' },
    { id: 'library', label: 'LIBRARY' },
    { id: 'practice', label: 'PRACTICE' },
    { id: 'review', label: 'REVIEW' },
    { id: 'settings', label: 'SETTINGS' },
  ];

  const canOpenCompiler = storyText.trim().length > 0 || job != null || doc != null;

  return (
    <UpdateProvider currentVersion="0.1.0" appName="Callibella">
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Callibella</div>
            <div className="mono muted">{view === 'compiler' ? `Title: ${compilerTitle}` : ''}</div>
          </div>
        </div>

        <div className="shell-body">
          <div className="nav-rail">
            {navItems.map((it) => (
              <button
                key={it.id}
                className={it.id === view ? 'nav-item active' : 'nav-item'}
                onClick={() => setView(it.id)}
              >
                {it.label}
              </button>
            ))}
            <hr />
            <button
              className={view === 'compiler' ? 'nav-item active' : 'nav-item'}
              onClick={() => setView('compiler')}
              disabled={!canOpenCompiler}
            >
              VIEWER
            </button>
          </div>

          <div className="main-surface">
            {renderSurface()}
          </div>
        </div>
      </div>
    </UpdateProvider>
  );
}
