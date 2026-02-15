import React from 'react';
import type { InteractiveDoc, StoryTranslation, TranslationJob } from '../bokaTypes';
import CategoryPicker from '../components/CategoryPicker';
import LanguagePicker from '../components/LanguagePicker';
import RegisterChip from '../components/RegisterChip';
import { REGISTER_CSS_VAR, type RegisterId } from '../registers';

export type ViewMode = 'expanded' | 'interactive';

export default function CompilerView(props: {
  title: string;
  sourceText: string;
  sourceLanguage: string;
  onSetTitle: (t: string) => void;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  job: TranslationJob | null;
  doc: InteractiveDoc | null;
  errorMessage: string | null;
  contentFilterEnabled: boolean;
  selectedSpanId: string | null;
  onSelectSpan: (spanId: string) => void;
  onSpeak: (text: string, language: string) => void;
  isAudioPlaying: boolean;
  activeLanguage: string | null;
  onSetActiveVariant: (spanId: string, variantIndex: number) => void;
  storyTranslations: Record<string, StoryTranslation>;
  onSwitchLanguage: (language: string) => void;
  category: string | null;
  allCategories: string[];
  onSetCategory: (cat: string | null) => void;
}) {
  const {
    title,
    sourceText,
    sourceLanguage,
    onSetTitle,
    mode,
    setMode,
    job,
    doc,
    errorMessage,
    contentFilterEnabled,
    selectedSpanId,
    onSelectSpan,
    onSpeak,
    isAudioPlaying,
    activeLanguage,
    onSetActiveVariant,
    storyTranslations,
    onSwitchLanguage,
    category,
    allCategories,
    onSetCategory,
  } = props;

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(title);

  const ready = job?.ready ?? false;
  const [registerTint, setRegisterTint] = React.useState(true);
  const [menuDir, setMenuDir] = React.useState<'down' | 'up'>('down');
  const [menuAlign, setMenuAlign] = React.useState<'left' | 'right'>('left');
  const activeSpanWrapRef = React.useRef<HTMLSpanElement | null>(null);
  const activeMenuRef = React.useRef<HTMLDivElement | null>(null);

  const baseReady = job ? job.segments.filter((s) => s.baseStage === 'ready').length : 0;
  const spanReady = job ? job.segments.filter((s) => s.spanStage === 'ready').length : 0;
  const total = job ? job.segments.length : 0;

  const visibleRegisters: RegisterId[] = React.useMemo(() => {
    const all: RegisterId[] = ['formal', 'literary', 'neutral', 'casual', 'colloquial', 'vulgar'];
    return contentFilterEnabled ? all.filter((r) => r !== 'vulgar') : all;
  }, [contentFilterEnabled]);

  const docBlocks: Array<Array<InteractiveDoc['tokens'][number]>> = React.useMemo(() => {
    if (!doc) return [];
    const blocks: Array<Array<InteractiveDoc['tokens'][number]>> = [];
    let cur: Array<InteractiveDoc['tokens'][number]> = [];
    for (const tok of doc.tokens) {
      if (tok.type === 'text' && tok.value === '\n\n') {
        blocks.push(cur);
        cur = [];
        continue;
      }
      cur.push(tok);
    }
    blocks.push(cur);
    return blocks;
  }, [doc]);

  function renderBlockForRegister(blockIndex: number, register: RegisterId): string {
    const block = docBlocks[blockIndex];
    if (!doc || !block) return '';

    let out = '';
    for (const tok of block) {
      if (tok.type === 'text') {
        out += tok.value;
        continue;
      }
      const span = doc.spans[tok.spanId];
      if (!span || span.variants.length === 0) {
        out += '…';
        continue;
      }

      const direct = span.variants.find((v) => v.register === register);
      const neutral = span.variants.find((v) => v.register === 'neutral');
      out += (direct ?? neutral ?? span.variants[0])?.text ?? '…';
    }

    return out;
  }

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return;
      if (!ready) return;
      if (mode !== 'expanded') return;
      e.preventDefault();
      setMode('interactive');
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, setMode, ready]);

  React.useLayoutEffect(() => {
    if (mode !== 'interactive') return;
    if (!selectedSpanId) return;

    const wrap = activeSpanWrapRef.current;
    const menu = activeMenuRef.current;
    if (!wrap || !menu) return;

    const panelBody = wrap.closest('.panel-body') as HTMLElement | null;
    if (!panelBody) return;

    const wrapRect = wrap.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const bodyRect = panelBody.getBoundingClientRect();

    const wouldOverflowBottom = wrapRect.bottom + 6 + menuRect.height > bodyRect.bottom;
    const wouldOverflowTop = wrapRect.top - 6 - menuRect.height < bodyRect.top;
    const nextDir = wouldOverflowBottom && !wouldOverflowTop ? 'up' : 'down';

    const wouldOverflowRight = wrapRect.left + menuRect.width > bodyRect.right;
    const wouldOverflowLeft = wrapRect.right - menuRect.width < bodyRect.left;
    const nextAlign = wouldOverflowRight && !wouldOverflowLeft ? 'right' : 'left';

    setMenuDir(nextDir);
    setMenuAlign(nextAlign);
  }, [mode, selectedSpanId]);

  React.useEffect(() => {
    if (mode !== 'interactive') return;
    if (!selectedSpanId) return;

    const onPointerDownCapture = (e: PointerEvent) => {
      const wrap = activeSpanWrapRef.current;
      if (!wrap) {
        onSelectSpan(selectedSpanId);
        return;
      }

      const target = e.target;
      if (!(target instanceof Node)) {
        onSelectSpan(selectedSpanId);
        return;
      }

      if (wrap.contains(target)) return;
      onSelectSpan(selectedSpanId);
    };

    window.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => window.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [mode, onSelectSpan, selectedSpanId]);

  if (activeLanguage === 'original') {
    return (
      <div className="surface surface-flex">
        <h1 className="surface-title">ORIGINAL</h1>
        <div className="panel panel-flex">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {editingTitle ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span>Script:</span>
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = titleDraft.trim();
                      if (v) onSetTitle(v);
                      setEditingTitle(false);
                    }
                    if (e.key === 'Escape') {
                      setTitleDraft(title);
                      setEditingTitle(false);
                    }
                  }}
                  onBlur={() => {
                    const v = titleDraft.trim();
                    if (v) onSetTitle(v);
                    setEditingTitle(false);
                  }}
                  autoFocus
                  style={{ flex: 1, fontWeight: 600 }}
                />
              </span>
            ) : (
              <span
                title="Double-click to edit"
                onDoubleClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                style={{ cursor: 'default' }}
              >
                Script: {title}
              </span>
            )}
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <CategoryPicker category={category} onSelect={onSetCategory} allCategories={allCategories} />
              <LanguagePicker
                translations={storyTranslations}
                activeLanguage={activeLanguage}
                onSelect={onSwitchLanguage}
                sourceLanguage={sourceLanguage}
              />
            </span>
          </div>
          <div className="panel-body">
            <div className="doc" style={{ whiteSpace: 'pre-wrap' }}>
              {sourceText || <span className="muted">No source text.</span>}
            </div>
          </div>
        </div>
        <div className="actionbar">
          <div className="mono muted" style={{ alignSelf: 'center' }}>
            Source ({sourceLanguage.toUpperCase()})
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'interactive') {
    return (
      <div className="surface surface-flex">
        <h1 className="surface-title">DOCUMENT</h1>
        <div className="panel panel-flex">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {editingTitle ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span>Script:</span>
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = titleDraft.trim();
                      if (v) onSetTitle(v);
                      setEditingTitle(false);
                    }
                    if (e.key === 'Escape') {
                      setTitleDraft(title);
                      setEditingTitle(false);
                    }
                  }}
                  onBlur={() => {
                    const v = titleDraft.trim();
                    if (v) onSetTitle(v);
                    setEditingTitle(false);
                  }}
                  autoFocus
                  style={{ flex: 1, fontWeight: 600 }}
                />
              </span>
            ) : (
              <span
                title="Double-click to edit"
                onDoubleClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                style={{ cursor: 'default' }}
              >
                Script: {title}
              </span>
            )}
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <CategoryPicker category={category} onSelect={onSetCategory} allCategories={allCategories} />
              <LanguagePicker
                translations={storyTranslations}
                activeLanguage={activeLanguage}
                onSelect={onSwitchLanguage}
                sourceLanguage={sourceLanguage}
              />
            </span>
          </div>
          <div className="panel-body">
            {!doc ? (
              <div className="muted">Document not ready yet.</div>
            ) : (
              <div className="doc">
                {doc.tokens.map((t, i) => {
                  if (t.type === 'text') {
                    return <React.Fragment key={`t-${i}`}>{t.value}</React.Fragment>;
                  }

                  const span = doc.spans[t.spanId];
                  const active = span?.activeVariantIndex ?? 0;
                  const label = span?.variants[active]?.text ?? span?.sourceText ?? '…';
                  const isActive = selectedSpanId === t.spanId;

                  const items =
                    span?.variants
                      .map((v, idx) => ({ v, idx }))
                      .filter(({ v }) => (contentFilterEnabled ? v.register !== 'vulgar' : true)) ?? [];

                  return (
                    <span
                      key={`s-${t.spanId}-${i}`}
                      className="span-wrap"
                      ref={(el) => {
                        if (!isActive) return;
                        activeSpanWrapRef.current = el;
                      }}
                    >
                      <button
                        className={isActive ? 'span-btn active' : 'span-btn'}
                        onClick={() => onSelectSpan(t.spanId)}
                        type="button"
                      >
                        {label}
                      </button>

                      {isActive ? (
                        <div
                          ref={(el) => {
                            activeMenuRef.current = el;
                          }}
                          className="span-menu"
                          role="menu"
                          style={{
                            top: menuDir === 'down' ? 'calc(100% + 6px)' : 'auto',
                            bottom: menuDir === 'up' ? 'calc(100% + 6px)' : 'auto',
                            left: menuAlign === 'left' ? 0 : 'auto',
                            right: menuAlign === 'right' ? 0 : 'auto',
                          }}
                        >
                          {items.map(({ v, idx }) => {
                            const activeItem = idx === (span?.activeVariantIndex ?? 0);
                            return (
                              <div key={v.id} style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                                <button
                                  className={activeItem ? 'span-menu-item active' : 'span-menu-item'}
                                  onClick={() => onSetActiveVariant(t.spanId, idx)}
                                  type="button"
                                  style={{ flex: 1 }}
                                >
                                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <RegisterChip register={v.register} />
                                    <span className="muted" style={{ fontSize: 12 }}>
                                      {v.note ?? ''}
                                    </span>
                                  </span>
                                  <span style={{ textAlign: 'left' }}>{v.text}</span>
                                </button>
                                <button
                                  className="audio-play-btn"
                                  type="button"
                                  disabled={isAudioPlaying}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSpeak(v.text, activeLanguage ?? 'en');
                                  }}
                                  title="Play audio"
                                >
                                  &#9654;
                                </button>
                              </div>
                            );
                          })}
                          {items.length === 0 ? <div className="mono muted">No visible variants.</div> : null}
                        </div>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="actionbar">
          <button onClick={() => setMode('expanded')}>VIEW: EXPANDED</button>
        </div>
      </div>
    );
  }

  return (
    <div className="surface">
      <h1 className="surface-title">{ready ? 'REGISTERS (EXPANDED)' : 'TRANSLATING (EXPANDED)'}</h1>
      <div className="panel" style={{ height: 'calc(100% - 52px)' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingTitle ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span>Title:</span>
              <input
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = titleDraft.trim();
                    if (v) onSetTitle(v);
                    setEditingTitle(false);
                  }
                  if (e.key === 'Escape') {
                    setTitleDraft(title);
                    setEditingTitle(false);
                  }
                }}
                onBlur={() => {
                  const v = titleDraft.trim();
                  if (v) onSetTitle(v);
                  setEditingTitle(false);
                }}
                autoFocus
                style={{ flex: 1, fontWeight: 600 }}
              />
            </span>
          ) : (
            <span
              title="Double-click to edit"
              onDoubleClick={() => { setTitleDraft(title); setEditingTitle(true); }}
              style={{ cursor: 'default' }}
            >
              Title: {title}
            </span>
          )}
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <CategoryPicker category={category} onSelect={onSetCategory} allCategories={allCategories} />
            <LanguagePicker
              translations={storyTranslations}
              activeLanguage={activeLanguage}
              onSelect={onSwitchLanguage}
            />
          </span>
        </div>
        <div className="panel-body">
          {errorMessage ? (
            <div className="mono" style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>
              {errorMessage}
            </div>
          ) : null}
          {!job ? (
            <div className="empty-state muted">No translation job.</div>
          ) : (
            <div className="expanded mono">
              {job.segments.map((seg, idx) => {
                const baseText = seg.baseText ?? seg.source;
                const hasBlock = idx < docBlocks.length;
                return (
                  <div key={seg.id} className="expanded-seg">
                    <div className="expanded-line">
                      <div className="expanded-line-label">BASE</div>
                      <div className="expanded-line-text">{baseText}</div>
                      {!ready ? (
                        <div className="expanded-line-meta">
                          <span className={seg.baseStage === 'ready' ? 'status ready' : 'status'}>
                            {seg.baseStage.toUpperCase()}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {visibleRegisters.map((r) => {
                      const text = hasBlock ? renderBlockForRegister(idx, r) : baseText;
                      const bg = registerTint
                        ? `color-mix(in srgb, ${REGISTER_CSS_VAR[r]} 14%, var(--bg))`
                        : 'transparent';

                      return (
                        <div
                          key={`${seg.id}-${r}`}
                          className="expanded-line"
                          style={{ borderLeftColor: REGISTER_CSS_VAR[r], background: bg }}
                        >
                          <div className="expanded-line-label">
                            <RegisterChip register={r} />
                          </div>
                          <div className="expanded-line-text">{text || '…'}</div>
                          {!ready ? (
                            <div className="expanded-line-meta">
                              <span className={seg.spanStage === 'ready' ? 'status ready' : 'status'}>
                                {seg.spanStage.toUpperCase()}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="actionbar">
        <button onClick={() => setRegisterTint((v) => !v)} disabled={!job}>
          {registerTint ? 'COLOR: TINT' : 'COLOR: OFF'}
        </button>
        <button onClick={() => setMode('interactive')} disabled={!ready}>
          VIEW: INTERACTIVE
        </button>

        <div className="mono muted" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          {ready
            ? 'READY (Enter)'
            : `Base ${baseReady}/${total} | Spans ${spanReady}/${total}`}
        </div>
      </div>
    </div>
  );
}
