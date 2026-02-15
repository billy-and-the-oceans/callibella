import React from 'react';
import type { Story } from '../bokaTypes';
import CategoryPicker from '../components/CategoryPicker';
import LanguagePicker from '../components/LanguagePicker';

export default function LibraryView(props: {
  stories: Story[];
  targetLanguage: string;
  allCategories: string[];
  onOpen: (id: string, language: string) => void;
  onSetCategory: (storyId: string, cat: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const { stories, targetLanguage, allCategories, onOpen, onSetCategory, onDelete } = props;

  const grouped = React.useMemo(() => {
    const uncategorized: Story[] = [];
    const byCategory: Record<string, Story[]> = {};

    for (const s of stories) {
      if (s.category == null) {
        uncategorized.push(s);
      } else {
        if (!byCategory[s.category]) byCategory[s.category] = [];
        byCategory[s.category].push(s);
      }
    }

    const categorized = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b));
    return { uncategorized, categorized };
  }, [stories]);

  function defaultLanguage(s: Story): string {
    if (s.translations[targetLanguage]) return targetLanguage;
    const available = Object.values(s.translations);
    if (available.length === 0) return targetLanguage;
    return available.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0].language;
  }

  const renderStoryRow = (s: Story) => {
    const lang = defaultLanguage(s);

    return (
      <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="nav-item" style={{ flex: 1 }} onClick={() => onOpen(s.id, lang)}>
          {s.title}
        </button>
        <CategoryPicker
          category={s.category}
          onSelect={(cat) => onSetCategory(s.id, cat)}
          allCategories={allCategories}
        />
        <LanguagePicker
          translations={s.translations}
          activeLanguage={lang}
          onSelect={(l) => onOpen(s.id, l)}
          sourceLanguage={s.sourceLanguage}
        />
        <button className="mono" onClick={() => onDelete(s.id)}>
          DEL
        </button>
      </div>
    );
  };

  return (
    <div className="surface">
      <h1 className="surface-title">LIBRARY</h1>
      <div className="panel" style={{ height: 'calc(100% - 52px)' }}>
        <div className="panel-header">Stories</div>
        <div className="panel-body">
          {stories.length === 0 ? (
            <div className="empty-state muted">No stories yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="mono muted" style={{ fontSize: 12, paddingBottom: 6 }}>
                  UNCATEGORIZED ({grouped.uncategorized.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grouped.uncategorized.length === 0 ? (
                    <div className="muted">(none)</div>
                  ) : (
                    grouped.uncategorized.map(renderStoryRow)
                  )}
                </div>
              </div>

              {grouped.categorized.map(([cat, catStories]) => (
                <div key={cat}>
                  <div className="mono muted" style={{ fontSize: 12, paddingBottom: 6 }}>
                    {cat.toUpperCase()} ({catStories.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {catStories.map(renderStoryRow)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
