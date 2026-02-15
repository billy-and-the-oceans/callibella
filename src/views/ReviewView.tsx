import React from 'react';
import type { Story } from '../bokaTypes';
import RegisterChip from '../components/RegisterChip';
import StoryPicker from '../components/StoryPicker';
import type { RegisterId } from '../registers';

type Flashcard = {
  id: string;
  storyId: string;
  storyTitle: string;
  language: string;
  spanId: string;
  sourceText: string;
  variantId: string;
  register: RegisterId;
  text: string;
  contextMasked?: string;
  note?: string;
};

const DELETED_KEY = 'boka.flashcards.deleted';

export default function ReviewView(props: {
  stories: Story[];
  contentFilterEnabled: boolean;
  onSpeak: (text: string, language: string) => void;
  isAudioPlaying: boolean;
}) {
  const { stories, contentFilterEnabled, onSpeak, isAudioPlaying } = props;

  const [selectedStoryId, setSelectedStoryId] = React.useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = React.useState<string | null>(null);
  const [selectedRegister, setSelectedRegister] = React.useState<RegisterId | null>(null);
  const [showDeleted, setShowDeleted] = React.useState(false);
  const [sessionMode, setSessionMode] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [sessionOrder, setSessionOrder] = React.useState<string[] | null>(null);

  const [deletedIds, setDeletedIds] = React.useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DELETED_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((x) => typeof x === 'string'));
    } catch {
      return new Set();
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(deletedIds)));
    } catch {}
  }, [deletedIds]);

  const resetSession = React.useCallback(() => {
    setCursor(0);
    setReveal(false);
    setSessionOrder(null);
  }, []);

  const buildMaskedContext = React.useCallback(
    (doc: NonNullable<Story['translations'][string]['doc']>, targetSpanId: string): string | null => {
      const blocks: Array<Array<typeof doc.tokens[number]>> = [];
      let cur: Array<typeof doc.tokens[number]> = [];
      for (const tok of doc.tokens) {
        if (tok.type === 'text' && tok.value === '\n\n') {
          blocks.push(cur);
          cur = [];
          continue;
        }
        cur.push(tok);
      }
      blocks.push(cur);

      const block = blocks.find((b) => b.some((t) => t.type === 'span' && t.spanId === targetSpanId));
      if (!block) return null;

      let out = '';
      for (const tok of block) {
        if (tok.type === 'text') {
          out += tok.value;
          continue;
        }
        if (tok.spanId === targetSpanId) {
          out += '____';
          continue;
        }
        const span = doc.spans[tok.spanId];
        if (!span || span.variants.length === 0) {
          out += '…';
          continue;
        }
        let idx = span.activeVariantIndex ?? 0;
        if (contentFilterEnabled && span.variants[idx]?.register === 'vulgar') {
          const next = span.variants.findIndex((v) => v.register !== 'vulgar');
          if (next >= 0) idx = next;
        }
        out += span.variants[idx]?.text ?? span.sourceText ?? '…';
      }

      return out;
    },
    [contentFilterEnabled],
  );

  const shuffle = React.useCallback(<T,>(items: T[]): T[] => {
    const next = items.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
    }
    return next;
  }, []);

  const allCards: Flashcard[] = React.useMemo(() => {
    const out: Flashcard[] = [];
    for (const story of stories) {
      for (const tr of Object.values(story.translations)) {
        const doc = tr.doc;
        if (!doc) continue;

        for (const [spanId, span] of Object.entries(doc.spans)) {
          const sourceText = span.sourceText || '';
          for (const v of span.variants) {
            if (!v.text || !v.text.trim()) continue;
            if (contentFilterEnabled && v.register === 'vulgar') continue;
            const id = `${story.id}:${tr.language}:${spanId}:${v.id}`;
            const contextMasked = buildMaskedContext(doc, spanId) ?? undefined;
            out.push({
              id,
              storyId: story.id,
              storyTitle: story.title,
              language: tr.language,
              spanId,
              sourceText,
              variantId: v.id,
              register: v.register,
              text: v.text,
              contextMasked,
              note: v.note,
            });
          }
        }
      }
    }
    out.sort((a, b) => {
      if (a.storyTitle !== b.storyTitle) return a.storyTitle.localeCompare(b.storyTitle);
      if (a.language !== b.language) return a.language.localeCompare(b.language);
      return a.sourceText.localeCompare(b.sourceText);
    });
    return out;
  }, [buildMaskedContext, contentFilterEnabled, stories]);

  const deckCards = React.useMemo(() => {
    return selectedStoryId ? allCards.filter((c) => c.storyId === selectedStoryId) : allCards;
  }, [allCards, selectedStoryId]);

  const deckLanguages = React.useMemo(() => {
    return Array.from(new Set(deckCards.map((c) => c.language))).sort();
  }, [deckCards]);

  const deckCardsFiltered = React.useMemo(() => {
    return deckCards.filter((c) => {
      if (selectedLanguage && c.language !== selectedLanguage) return false;
      if (selectedRegister && c.register !== selectedRegister) return false;
      return true;
    });
  }, [deckCards, selectedLanguage, selectedRegister]);

  const visibleCards = React.useMemo(() => {
    const filtered = showDeleted
      ? deckCardsFiltered.filter((c) => deletedIds.has(c.id))
      : deckCardsFiltered.filter((c) => !deletedIds.has(c.id));
    return filtered;
  }, [deckCardsFiltered, deletedIds, showDeleted]);

  React.useEffect(() => {
    setCursor(0);
    setReveal(false);
    setSessionOrder(null);
  }, [selectedLanguage, selectedRegister, selectedStoryId, showDeleted, sessionMode]);

  React.useEffect(() => {
    if (!sessionMode) return;
    if (visibleCards.length === 0) return;
    if (sessionOrder && sessionOrder.length > 0) return;
    setSessionOrder(shuffle(visibleCards.map((c) => c.id)));
  }, [sessionMode, sessionOrder, shuffle, visibleCards]);

  React.useEffect(() => {
    if (!sessionMode) return;
    if (!sessionOrder) return;
    if (cursor <= sessionOrder.length - 1) return;
    setCursor(0);
  }, [cursor, sessionMode, sessionOrder]);

  const visibleById = React.useMemo(() => {
    const map = new Map<string, Flashcard>();
    for (const c of visibleCards) map.set(c.id, c);
    return map;
  }, [visibleCards]);

  const sessionCards = React.useMemo(() => {
    if (!sessionMode) return visibleCards;
    if (!sessionOrder) return visibleCards;
    const ordered: Flashcard[] = [];
    for (const id of sessionOrder) {
      const c = visibleById.get(id);
      if (c) ordered.push(c);
    }
    return ordered;
  }, [sessionMode, sessionOrder, visibleById, visibleCards]);

  const active = sessionCards.length > 0 ? sessionCards[cursor % sessionCards.length] : null;

  return (
    <div className="surface surface-flex">
      <h1 className="surface-title">REVIEW</h1>
      <div className="panel-grid-2" style={{ height: 'calc(100% - 52px)' }}>
        <div className="panel">
          <div className="panel-header">DECKS</div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StoryPicker
                stories={stories}
                selectedStoryId={selectedStoryId}
                onSelect={(id) => setSelectedStoryId(id)}
                showAll
                cardCounts={React.useMemo(() => {
                  const m = new Map<string, number>();
                  for (const c of allCards) m.set(c.storyId, (m.get(c.storyId) ?? 0) + 1);
                  return m;
                }, [allCards])}
              />
              <hr />
              <div className="mono muted" style={{ fontSize: 12 }}>
                LANGUAGE
              </div>
              <button
                className={selectedLanguage == null ? 'nav-item active' : 'nav-item'}
                onClick={() => setSelectedLanguage(null)}
              >
                ALL
              </button>
              {deckLanguages.map((l) => (
                <button
                  key={l}
                  className={selectedLanguage === l ? 'nav-item active' : 'nav-item'}
                  onClick={() => setSelectedLanguage(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
              <hr />
              <div className="mono muted" style={{ fontSize: 12 }}>
                REGISTER
              </div>
              <button
                className={selectedRegister == null ? 'nav-item active' : 'nav-item'}
                onClick={() => setSelectedRegister(null)}
              >
                ALL
              </button>
              {(['neutral', 'formal', 'casual', 'colloquial', 'literary', 'vulgar'] as RegisterId[])
                .filter((r) => (contentFilterEnabled ? r !== 'vulgar' : true))
                .map((r) => (
                  <button
                    key={r}
                    className={selectedRegister === r ? 'nav-item active' : 'nav-item'}
                    onClick={() => setSelectedRegister(r)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span>{r.toUpperCase()}</span>
                      <RegisterChip register={r} />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>FLASHCARDS</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="mono muted">
                  {deckCardsFiltered.filter((c) => !deletedIds.has(c.id)).length} / {deckCardsFiltered.length}
                </span>
                <button onClick={() => setShowDeleted((v) => !v)}>
                  {showDeleted ? 'VIEW: ACTIVE' : 'VIEW: DELETED'}
                </button>
                <button onClick={() => setSessionMode((v) => !v)}>
                  {sessionMode ? 'MODE: MANAGE' : 'MODE: SESSION'}
                </button>
                {showDeleted && visibleCards.length > 0 ? (
                  <button
                    onClick={() => {
                      setDeletedIds((prev) => {
                        const next = new Set(prev);
                        for (const c of visibleCards) next.delete(c.id);
                        return next;
                      });
                      resetSession();
                    }}
                  >
                    RESTORE ALL
                  </button>
                ) : null}
                {deletedIds.size > 0 ? (
                  <button
                    onClick={() => {
                      setDeletedIds(new Set());
                      resetSession();
                    }}
                  >
                    CLEAR DELETED
                  </button>
                ) : null}
                {sessionMode && visibleCards.length > 1 ? (
                  <button
                    onClick={() => {
                      setSessionOrder(shuffle(visibleCards.map((c) => c.id)));
                      setCursor(0);
                      setReveal(false);
                    }}
                  >
                    SHUFFLE
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="panel-body">
            {visibleCards.length === 0 ? (
              <div className="empty-state muted">No flashcards.</div>
            ) : sessionMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="mono muted">
                  {cursor + 1} / {sessionCards.length}
                </div>
                {active ? (
                  <div style={{ border: '1px solid var(--line)', padding: 12 }}>
                    <div className="mono muted" style={{ fontSize: 12, paddingBottom: 8 }}>
                      {active.storyTitle} · {active.language.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>FRONT</div>
                      <RegisterChip register={active.register as any} />
                    </div>
                    <div className="mono" style={{ whiteSpace: 'pre-wrap', paddingBottom: 10 }}>
                      {active.contextMasked || active.sourceText || '…'}
                    </div>
                    {reveal ? (
                      <div>
                        <div style={{ fontWeight: 600, paddingBottom: 8 }}>BACK</div>
                        <div className="mono" style={{ whiteSpace: 'pre-wrap' }}>
                          {active.text}
                        </div>
                        {active.note ? (
                          <div className="muted" style={{ paddingTop: 8 }}>
                            {active.note}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="actionbar">
                  <button
                    disabled={!active || isAudioPlaying}
                    onClick={() => {
                      if (!active) return;
                      onSpeak(active.text, active.language);
                    }}
                  >
                    HEAR
                  </button>
                  <button onClick={() => setReveal((v) => !v)}>{reveal ? 'HIDE' : 'REVEAL'}</button>
                  <button
                    onClick={() => {
                      setCursor((c) => Math.max(0, c - 1));
                      setReveal(false);
                    }}
                    disabled={cursor <= 0}
                  >
                    PREV
                  </button>
                  <button
                    onClick={() => {
                      setCursor((c) => Math.min(sessionCards.length - 1, c + 1));
                      setReveal(false);
                    }}
                    disabled={cursor >= sessionCards.length - 1}
                  >
                    NEXT
                  </button>
                  <button
                    onClick={() => {
                      if (!active) return;
                      setDeletedIds((prev) => {
                        const next = new Set(prev);
                        next.add(active.id);
                        return next;
                      });
                      setReveal(false);
                    }}
                    disabled={!active || deletedIds.has(active.id)}
                  >
                    DELETE CARD
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleCards.slice(0, 250).map((c) => (
                  <div
                    key={c.id}
                    style={{ border: '1px solid var(--line)', padding: 10, display: 'flex', gap: 10 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono muted" style={{ fontSize: 12, paddingBottom: 6 }}>
                        {c.storyTitle} · {c.language.toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
                        <RegisterChip register={c.register as any} />
                        <div className="mono" style={{ whiteSpace: 'pre-wrap' }}>
                          {c.sourceText || '…'}
                        </div>
                      </div>
                      <div className="mono muted" style={{ whiteSpace: 'pre-wrap' }}>
                        {c.text}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        className="mono"
                        disabled={isAudioPlaying}
                        onClick={() => onSpeak(c.text, c.language)}
                      >
                        HEAR
                      </button>
                      {showDeleted ? (
                        <button
                          className="mono"
                          onClick={() => {
                            setDeletedIds((prev) => {
                              const next = new Set(prev);
                              next.delete(c.id);
                              return next;
                            });
                          }}
                        >
                          RESTORE
                        </button>
                      ) : (
                        <button
                          className="mono"
                          onClick={() => {
                            setDeletedIds((prev) => {
                              const next = new Set(prev);
                              next.add(c.id);
                              return next;
                            });
                          }}
                        >
                          DEL
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {visibleCards.length > 250 ? (
                  <div className="muted">Showing first 250 cards.</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
