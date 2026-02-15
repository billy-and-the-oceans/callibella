import React from 'react';
import { TTS_LANGUAGES, OTHER_LANGUAGES, ALL_LANGUAGES, hasTts, loadMyLanguages } from '../languages';

export default function LanguagePicker(props: {
  translations: Record<string, unknown>;
  activeLanguage: string | null;
  onSelect: (language: string) => void;
  sourceLanguage?: string;
}) {
  const { translations, activeLanguage, onSelect, sourceLanguage } = props;
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

  const translatedCodes = new Set(Object.keys(translations));
  const myLanguages = loadMyLanguages();
  const myLangCodes = new Set(myLanguages.map((l) => l.code));

  // Filter out source language from all lists (you can't translate into your own source language)
  const isSourceLang = (code: string) => sourceLanguage ? code === sourceLanguage : false;
  const ttsFiltered = TTS_LANGUAGES.filter((l) => !myLangCodes.has(l.code) && !isSourceLang(l.code));
  const otherFiltered = OTHER_LANGUAGES.filter((l) => !myLangCodes.has(l.code) && !isSourceLang(l.code));
  const myLanguagesFiltered = myLanguages.filter((l) => !isSourceLang(l.code));

  // Languages that have translations but aren't in any standard or user list
  const allListedCodes = new Set([
    ...myLanguages.map((l) => l.code),
    ...ALL_LANGUAGES.map((l) => l.code),
  ]);
  const extraTranslated = [...translatedCodes]
    .filter((code) => !allListedCodes.has(code))
    .map((code) => ({ code, label: code }));

  const triggerLabel = activeLanguage === 'original' ? 'ORIGINAL' : activeLanguage?.toUpperCase() ?? '\u2014';

  return (
    <div className="lang-dropdown" ref={ref} style={{ display: 'inline-block' }}>
      <button
        className="lang-dropdown-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{ minWidth: 'auto', padding: '3px 8px', fontSize: 12 }}
      >
        <span className="mono">{triggerLabel}</span>
        <span style={{ fontSize: 8, marginLeft: 4 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open ? (
        <div className="lang-dropdown-menu" style={{ minWidth: 200 }}>
          {sourceLanguage ? (
            <>
              <LangRow
                label="Original"
                hasTranslation={true}
                isActive={activeLanguage === 'original'}
                onSelect={() => {
                  onSelect('original');
                  setOpen(false);
                }}
              />
              <hr />
            </>
          ) : null}

          {extraTranslated.length > 0 ? (
            <>
              {extraTranslated.map((l) => (
                <LangRow
                  key={l.code}
                  label={l.label}
                  hasTranslation={true}
                  isActive={l.code === activeLanguage}
                  onSelect={() => {
                    onSelect(l.code);
                    setOpen(false);
                  }}
                />
              ))}
              <hr />
            </>
          ) : null}

          {myLanguagesFiltered.length > 0 ? (
            <>
              <div className="lang-section-label">MY LANGUAGES</div>
              {myLanguagesFiltered.map((l) => (
                <LangRow
                  key={l.code}
                  label={l.label}
                  hasTranslation={translatedCodes.has(l.code)}
                  isActive={l.code === activeLanguage}
                  tts={hasTts(l.code)}
                  onSelect={() => {
                    onSelect(l.code);
                    setOpen(false);
                  }}
                />
              ))}
              <hr />
            </>
          ) : null}

          {ttsFiltered.map((l) => (
            <LangRow
              key={l.code}
              label={l.label}
              hasTranslation={translatedCodes.has(l.code)}
              isActive={l.code === activeLanguage}
              tts={true}
              onSelect={() => {
                onSelect(l.code);
                setOpen(false);
              }}
            />
          ))}

          {otherFiltered.length > 0 ? (
            <>
              <div className="lang-section-label">TEXT ONLY</div>
              {otherFiltered.map((l) => (
                <LangRow
                  key={l.code}
                  label={l.label}
                  hasTranslation={translatedCodes.has(l.code)}
                  isActive={l.code === activeLanguage}
                  onSelect={() => {
                    onSelect(l.code);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LangRow(props: {
  label: string;
  hasTranslation: boolean;
  isActive: boolean;
  tts?: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={props.isActive ? 'lang-row active' : 'lang-row'} onClick={props.onSelect}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ width: 16, textAlign: 'center', fontSize: 12, opacity: props.hasTranslation ? 1 : 0.2 }}>
          {props.hasTranslation ? '\u2713' : '\u2013'}
        </span>
        <span>{props.label}</span>
      </span>
      {props.tts ? <span className="lang-tts-badge">TTS</span> : null}
    </div>
  );
}
