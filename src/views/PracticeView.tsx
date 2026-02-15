import React from 'react';
import type { Story } from '../bokaTypes';
import StoryPicker from '../components/StoryPicker';

type Phrase = {
  text: string;
  sourceText: string;
  language: string;
};

export default function PracticeView(props: {
  stories: Story[];
  onSpeak: (text: string, language: string) => void;
  isAudioPlaying: boolean;
  audioSpeed: number;
  setAudioSpeed: (v: number) => void;
}) {
  const { stories, onSpeak, isAudioPlaying, audioSpeed, setAudioSpeed } = props;

  const [selectedStoryId, setSelectedStoryId] = React.useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState(0);

  const storiesWithDocs = React.useMemo(
    () => stories.filter((s) => Object.values(s.translations).some((t) => t.doc != null)),
    [stories],
  );

  const selectedStory = React.useMemo(
    () => storiesWithDocs.find((s) => s.id === selectedStoryId) ?? null,
    [storiesWithDocs, selectedStoryId],
  );

  const availableLanguages = React.useMemo(() => {
    if (!selectedStory) return [];
    return Object.entries(selectedStory.translations)
      .filter(([, t]) => t.doc != null)
      .map(([lang]) => lang)
      .sort();
  }, [selectedStory]);

  const activeTranslation = React.useMemo(() => {
    if (!selectedStory) return null;
    if (selectedLanguage && selectedStory.translations[selectedLanguage]?.doc) {
      return selectedStory.translations[selectedLanguage];
    }
    const first = availableLanguages[0];
    return first ? selectedStory.translations[first] ?? null : null;
  }, [availableLanguages, selectedLanguage, selectedStory]);

  const phrases: Phrase[] = React.useMemo(() => {
    const doc = activeTranslation?.doc;
    if (!doc) return [];
    const lang = activeTranslation?.language ?? 'en';

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

    return blocks.map((block) => {
      let text = '';
      let sourceText = '';
      for (const tok of block) {
        if (tok.type === 'text') {
          text += tok.value;
          sourceText += tok.value;
          continue;
        }
        const span = doc.spans[tok.spanId];
        if (!span || span.variants.length === 0) {
          text += '...';
          sourceText += span?.sourceText ?? '...';
          continue;
        }
        const active = span.variants[span.activeVariantIndex] ?? span.variants[0];
        text += active?.text ?? '...';
        sourceText += span.sourceText;
      }
      return { text: text.trim(), sourceText: sourceText.trim(), language: lang };
    }).filter((p) => p.text.length > 0);
  }, [activeTranslation]);

  const activePhrase = phrases.length > 0 ? phrases[cursor % phrases.length] ?? null : null;

  React.useEffect(() => {
    setCursor(0);
  }, [selectedStoryId, selectedLanguage]);

  return (
    <div className="surface surface-flex">
      <h1 className="surface-title">PRACTICE</h1>
      <div className="panel-grid-2" style={{ height: 'calc(100% - 52px)' }}>
        <div className="panel">
          <div className="panel-header">STORIES</div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StoryPicker
                stories={storiesWithDocs}
                selectedStoryId={selectedStoryId}
                onSelect={(id) => setSelectedStoryId(id)}
              />
              {selectedStory && availableLanguages.length > 1 ? (
                <>
                  <hr />
                  <div className="mono muted" style={{ fontSize: 12 }}>LANGUAGE</div>
                  {availableLanguages.map((l) => (
                    <button
                      key={l}
                      className={
                        (selectedLanguage ?? availableLanguages[0]) === l ? 'nav-item active' : 'nav-item'
                      }
                      onClick={() => setSelectedLanguage(l)}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </>
              ) : null}
              <hr />
              <div className="mono muted" style={{ fontSize: 12 }}>SPEED</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={audioSpeed}
                  onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span className="mono" style={{ minWidth: 36, textAlign: 'right' }}>
                  {audioSpeed.toFixed(1)}x
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>SHADOWING</div>
              {phrases.length > 0 ? (
                <span className="mono muted">
                  {cursor + 1} / {phrases.length}
                </span>
              ) : null}
            </div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!selectedStory ? (
              <div className="empty-state muted">Select a story to begin.</div>
            ) : phrases.length === 0 ? (
              <div className="muted">No phrases available.</div>
            ) : activePhrase ? (
              <>
                <div style={{ border: '1px solid var(--line)', padding: 16 }}>
                  <div className="mono muted" style={{ fontSize: 12, paddingBottom: 8 }}>
                    {selectedStory.title} · {activePhrase.language.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 18, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {activePhrase.text}
                  </div>
                  {activePhrase.sourceText !== activePhrase.text ? (
                    <div className="mono muted" style={{ paddingTop: 10, fontSize: 13 }}>
                      {activePhrase.sourceText}
                    </div>
                  ) : null}
                </div>
                <div className="actionbar">
                  <button
                    disabled={isAudioPlaying}
                    onClick={() => onSpeak(activePhrase.text, activePhrase.language)}
                  >
                    HEAR
                  </button>
                  <button
                    onClick={() => {
                      setCursor((c) => Math.max(0, c - 1));
                    }}
                    disabled={cursor <= 0}
                  >
                    PREV
                  </button>
                  <button
                    onClick={() => {
                      setCursor((c) => Math.min(phrases.length - 1, c + 1));
                    }}
                    disabled={cursor >= phrases.length - 1}
                  >
                    NEXT
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
