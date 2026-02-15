import React from 'react';
import type { Story } from '../bokaTypes';

export default function StoryPicker(props: {
  stories: Story[];
  selectedStoryId: string | null;
  onSelect: (storyId: string | null) => void;
  showAll?: boolean;
  cardCounts?: Map<string, number>;
}) {
  const { stories, selectedStoryId, onSelect, showAll, cardCounts } = props;
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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

  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const triggerLabel = selectedStory ? selectedStory.title : showAll ? 'ALL STORIES' : 'Select a story...';

  const renderRow = (s: Story) => {
    const isActive = s.id === selectedStoryId;
    const count = cardCounts?.get(s.id);

    return (
      <div
        key={s.id}
        className={isActive ? 'lang-row active' : 'lang-row'}
        onClick={() => { onSelect(s.id); setOpen(false); }}
      >
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%' }}>
          <span>{s.title}</span>
          {count != null ? <span className="mono muted">{count}</span> : null}
        </span>
      </div>
    );
  };

  return (
    <div className="lang-dropdown" ref={ref}>
      <button
        className="lang-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{triggerLabel}</span>
        <span style={{ fontSize: 8, marginLeft: 4 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open ? (
        <div className="lang-dropdown-menu">
          {showAll ? (
            <>
              <div
                className={selectedStoryId == null ? 'lang-row active' : 'lang-row'}
                onClick={() => { onSelect(null); setOpen(false); }}
              >
                All Stories
              </div>
              <hr />
            </>
          ) : null}

          {stories.length === 0 ? (
            <div className="lang-row" style={{ opacity: 0.5 }}>No stories</div>
          ) : (
            <>
              {grouped.uncategorized.length > 0 ? (
                <>
                  <div className="lang-section-label">UNCATEGORIZED</div>
                  {grouped.uncategorized.map(renderRow)}
                </>
              ) : null}

              {grouped.categorized.map(([cat, catStories]) => (
                <React.Fragment key={cat}>
                  {grouped.uncategorized.length > 0 || grouped.categorized[0][0] !== cat ? <hr /> : null}
                  <div className="lang-section-label">{cat.toUpperCase()}</div>
                  {catStories.map(renderRow)}
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
