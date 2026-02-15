import React from 'react';
import CategoryPicker from '../components/CategoryPicker';

export default function NewView(props: {
  storyTitle: string;
  setStoryTitle: (v: string) => void;
  storyText: string;
  setStoryText: (v: string) => void;
  category: string | null;
  setCategory: (v: string | null) => void;
  allCategories: string[];
  onTranslate: () => void;
}) {
  const {
    storyTitle,
    setStoryTitle,
    storyText,
    setStoryText,
    category,
    setCategory,
    allCategories,
    onTranslate,
  } = props;

  return (
    <div className="surface">
      <h1 className="surface-title">NEW</h1>
      <div className="panel-grid-2">
        <div className="panel">
          <div className="panel-header">CATEGORY</div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="mono muted" style={{ fontSize: 12, paddingBottom: 4 }}>
                TITLE
              </div>
              <input
                className="input"
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="Title..."
              />
              <div style={{ height: 10 }} />
              <div className="mono muted" style={{ fontSize: 12, paddingBottom: 4 }}>
                CATEGORY
              </div>
              <CategoryPicker
                category={category}
                onSelect={setCategory}
                allCategories={allCategories}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">STORY EDITOR</div>
          <div className="panel-body" style={{ flex: 1 }}>
            <textarea
              className="textarea"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Paste a story..."
            />
          </div>
        </div>
      </div>

      <div className="actionbar">
        <button onClick={onTranslate} disabled={storyText.trim().length === 0}>
          TRANSLATE
        </button>
        <button onClick={() => { setStoryText(''); setStoryTitle(''); setCategory(null); }} disabled={storyText.length === 0 && storyTitle.length === 0}>
          CLEAR
        </button>
      </div>
    </div>
  );
}
