import React from 'react';

export default function CategoryPicker(props: {
  category: string | null;
  onSelect: (category: string | null) => void;
  allCategories: string[];
}) {
  const { category, onSelect, allCategories } = props;
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newCat, setNewCat] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const triggerLabel = category ?? 'UNCATEGORIZED';

  return (
    <div className="lang-dropdown cat-dropdown" ref={ref} style={{ display: 'inline-block' }}>
      <button
        className="lang-dropdown-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setAdding(false);
        }}
        style={{ minWidth: 'auto', padding: '3px 8px', fontSize: 11 }}
      >
        <span className="mono">{triggerLabel}</span>
        <span style={{ fontSize: 8, marginLeft: 4 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open ? (
        <div className="lang-dropdown-menu" style={{ minWidth: 180 }}>
          <div
            className={category == null ? 'lang-row active' : 'lang-row'}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 16, textAlign: 'center', fontSize: 12, opacity: category == null ? 1 : 0.2 }}>
                {category == null ? '\u2713' : '\u2013'}
              </span>
              <span>Uncategorized</span>
            </span>
          </div>

          <hr />

          <div className="lang-section-label">CATEGORIES</div>
          {allCategories.map((cat) => (
            <div
              key={cat}
              className={cat === category ? 'lang-row active' : 'lang-row'}
              onClick={() => {
                onSelect(cat);
                setOpen(false);
              }}
            >
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 16, textAlign: 'center', fontSize: 12, opacity: cat === category ? 1 : 0.2 }}>
                  {cat === category ? '\u2713' : '\u2013'}
                </span>
                <span>{cat}</span>
              </span>
            </div>
          ))}

          <hr />

          {adding ? (
            <div style={{ padding: '4px 8px' }}>
              <input
                className="input"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category..."
                autoFocus
                style={{ width: '100%', fontSize: 12 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = newCat.trim();
                    if (v) {
                      onSelect(v);
                      setOpen(false);
                      setAdding(false);
                      setNewCat('');
                    }
                  }
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewCat('');
                  }
                }}
              />
            </div>
          ) : (
            <div
              className="lang-row"
              onClick={() => setAdding(true)}
              style={{ opacity: 0.6 }}
            >
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>+</span>
                <span>New category...</span>
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
