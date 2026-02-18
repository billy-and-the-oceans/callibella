import React from 'react';
import { version as appVersion } from '../../package.json';
import type { AudioModelStatus } from '../bokaTypes';
import type { LlmProviderConfig, LlmProviderPreset } from '../bokaTypes';
import { test_tauri_provider } from '../tauriTranslation';
import { TTS_LANGUAGES, OTHER_LANGUAGES, ALL_LANGUAGES, hasTts } from '../languages';
import UpdatePanel from '../components/update/UpdatePanel';

export default function SettingsView(props: {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  contentFilterEnabled: boolean;
  setContentFilterEnabled: (v: boolean) => void;
  targetLanguage: string;
  setTargetLanguage: (v: string) => void;
  sourceLanguage: string;
  setSourceLanguage: (v: string) => void;
  denseSpans: boolean;
  setDenseSpans: (v: boolean) => void;
  provider: LlmProviderConfig;
  setProvider: (next: LlmProviderConfig) => void;
  audioStatus: AudioModelStatus;
  audioSpeed: number;
  setAudioSpeed: (v: number) => void;
  onDownloadModel: () => void;
}) {
  const {
    theme,
    setTheme,
    contentFilterEnabled,
    setContentFilterEnabled,
    targetLanguage,
    setTargetLanguage,
    sourceLanguage,
    setSourceLanguage,
    denseSpans,
    setDenseSpans,
    provider,
    setProvider,
    audioStatus,
    audioSpeed,
    setAudioSpeed,
    onDownloadModel,
  } = props;

  const [providerTestStatus, setProviderTestStatus] = React.useState<
    { state: 'idle' | 'running' | 'ok' | 'error'; message?: string }
  >({ state: 'idle' });

  const PROVIDERS: Array<{ id: LlmProviderPreset; label: string }> = [
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'ollama', label: 'Ollama (local)' },
    { id: 'lmstudio', label: 'LM Studio (local)' },
    { id: 'custom', label: 'Custom (OpenAI-compatible)' },
  ];

  const getDefaults = (preset: LlmProviderPreset): { baseUrl?: string; model?: string } => {
    if (preset === 'openai') return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
    if (preset === 'openrouter') return { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' };
    if (preset === 'ollama') return { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' };
    if (preset === 'lmstudio') return { baseUrl: 'http://localhost:1234/v1', model: 'llama3.1' };
    if (preset === 'anthropic') return { model: 'claude-sonnet-4-20250514' };
    return {};
  };

  const defaults = getDefaults(provider.preset);
  const effectiveBaseUrl = provider.baseUrl?.trim() || defaults.baseUrl || '';
  const effectiveModel = provider.model?.trim() || defaults.model || '';


  const [myLanguages, setMyLanguages] = React.useState<Array<{ code: string; label: string }>>(() => {
    try {
      const raw = localStorage.getItem('boka.myLanguages');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('boka.myLanguages', JSON.stringify(myLanguages));
    } catch {}
  }, [myLanguages]);

  const [langDropdownOpen, setLangDropdownOpen] = React.useState(false);
  const [addingCustomLang, setAddingCustomLang] = React.useState(false);
  const [customLangInput, setCustomLangInput] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!langDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [langDropdownOpen]);

  const myLangCodes = new Set(myLanguages.map((l) => l.code));
  const ttsFiltered = TTS_LANGUAGES.filter((l) => !myLangCodes.has(l.code));
  const otherFiltered = OTHER_LANGUAGES.filter((l) => !myLangCodes.has(l.code));

  const currentLangLabel = (() => {
    const found = ALL_LANGUAGES.find((l) => l.code === targetLanguage);
    if (found) return `${found.label} (${found.code.toUpperCase()})`;
    const myFound = myLanguages.find((l) => l.code === targetLanguage);
    if (myFound) return `${myFound.label}`;
    return targetLanguage;
  })();

  const sourceLangLabel = (() => {
    const found = ALL_LANGUAGES.find((l) => l.code === sourceLanguage);
    if (found) return `${found.label} (${found.code.toUpperCase()})`;
    const myFound = myLanguages.find((l) => l.code === sourceLanguage);
    if (myFound) return `${myFound.label}`;
    return sourceLanguage;
  })();

  // Source language dropdown state
  const [srcDropdownOpen, setSrcDropdownOpen] = React.useState(false);
  const [addingSrcCustom, setAddingSrcCustom] = React.useState(false);
  const [srcCustomInput, setSrcCustomInput] = React.useState('');
  const srcDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!srcDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (srcDropdownRef.current && !srcDropdownRef.current.contains(e.target as Node)) {
        setSrcDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [srcDropdownOpen]);

  function addToMyLanguages(code: string, label: string) {
    setMyLanguages((prev) => {
      if (prev.some((l) => l.code === code)) return prev;
      return [...prev, { code, label }];
    });
  }

  function removeFromMyLanguages(code: string) {
    setMyLanguages((prev) => prev.filter((l) => l.code !== code));
  }

  return (
    <div className="surface">
      <h1 className="surface-title">SETTINGS</h1>
      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="panel-header">Preferences</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Theme</div>
            <button onClick={() => setTheme('light')} className={theme === 'light' ? 'nav-item active' : 'nav-item'}>
              LIGHT
            </button>
            <button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'nav-item active' : 'nav-item'}>
              DARK
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Content Filter</div>
            <button
              onClick={() => setContentFilterEnabled(true)}
              className={contentFilterEnabled ? 'nav-item active' : 'nav-item'}
            >
              ON
            </button>
            <button
              onClick={() => setContentFilterEnabled(false)}
              className={!contentFilterEnabled ? 'nav-item active' : 'nav-item'}
            >
              OFF
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              {contentFilterEnabled ? 'Filtered (default).' : 'Full register spectrum.'}
            </div>
          </div>

          <hr />

          <div className="mono" style={{ fontSize: 12, letterSpacing: 0.3 }}>
            TRANSLATION
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>I write in</div>
            <div className="lang-dropdown" ref={srcDropdownRef} style={{ flex: 1, minWidth: 240 }}>
              <button
                className="lang-dropdown-trigger"
                onClick={() => { setSrcDropdownOpen((v) => !v); setAddingSrcCustom(false); }}
              >
                <span>{sourceLangLabel}</span>
                <span style={{ fontSize: 10 }}>{srcDropdownOpen ? '\u25B2' : '\u25BC'}</span>
              </button>

              {srcDropdownOpen ? (
                <div className="lang-dropdown-menu">
                  {myLanguages.length > 0 ? (
                    <>
                      <div className="lang-section-label">MY LANGUAGES</div>
                      {myLanguages.map((l) => (
                        <div
                          key={l.code}
                          className={l.code === sourceLanguage ? 'lang-row active' : 'lang-row'}
                          onClick={() => { setSourceLanguage(l.code); setSrcDropdownOpen(false); }}
                        >
                          <span>{l.label}</span>
                        </div>
                      ))}
                      <hr />
                    </>
                  ) : null}

                  {TTS_LANGUAGES.filter((l) => !myLangCodes.has(l.code)).map((l) => (
                    <div
                      key={l.code}
                      className={l.code === sourceLanguage ? 'lang-row active' : 'lang-row'}
                      onClick={() => { setSourceLanguage(l.code); setSrcDropdownOpen(false); }}
                    >
                      <span>{l.label}</span>
                    </div>
                  ))}

                  {OTHER_LANGUAGES.filter((l) => !myLangCodes.has(l.code)).length > 0 ? (
                    <>
                      <div className="lang-section-label">OTHER</div>
                      {OTHER_LANGUAGES.filter((l) => !myLangCodes.has(l.code)).map((l) => (
                        <div
                          key={l.code}
                          className={l.code === sourceLanguage ? 'lang-row active' : 'lang-row'}
                          onClick={() => { setSourceLanguage(l.code); setSrcDropdownOpen(false); }}
                        >
                          <span>{l.label}</span>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              onClick={() => { setAddingSrcCustom((v) => !v); setSrcDropdownOpen(false); }}
              title="Add custom source language"
              style={{ fontSize: 16, padding: '4px 10px' }}
            >
              +
            </button>
          </div>

          {addingSrcCustom ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 140 }} />
              <input
                className="input"
                value={srcCustomInput}
                onChange={(e) => setSrcCustomInput(e.target.value)}
                placeholder="Language name or code..."
                style={{ flex: 1 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = srcCustomInput.trim();
                    if (!v) return;
                    addToMyLanguages(v.toLowerCase(), v);
                    setSourceLanguage(v.toLowerCase());
                    setSrcCustomInput('');
                    setAddingSrcCustom(false);
                  }
                  if (e.key === 'Escape') {
                    setAddingSrcCustom(false);
                    setSrcCustomInput('');
                  }
                }}
              />
              <button onClick={() => {
                const v = srcCustomInput.trim();
                if (!v) return;
                addToMyLanguages(v.toLowerCase(), v);
                setSourceLanguage(v.toLowerCase());
                setSrcCustomInput('');
                setAddingSrcCustom(false);
              }}>
                SET
              </button>
              <button onClick={() => { setAddingSrcCustom(false); setSrcCustomInput(''); }}>
                CANCEL
              </button>
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12 }}>
            The language you write your stories in. Passed to the LLM for better translation quality.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Translate to</div>
            <div className="lang-dropdown" ref={dropdownRef} style={{ flex: 1, minWidth: 240 }}>
              <button
                className="lang-dropdown-trigger"
                onClick={() => { setLangDropdownOpen((v) => !v); setAddingCustomLang(false); }}
              >
                <span>{currentLangLabel}</span>
                <span style={{ fontSize: 10 }}>{langDropdownOpen ? '\u25B2' : '\u25BC'}</span>
              </button>

              {langDropdownOpen ? (
                <div className="lang-dropdown-menu">
                  {myLanguages.length > 0 ? (
                    <>
                      <div className="lang-section-label">MY LANGUAGES</div>
                      {myLanguages.map((l) => (
                        <div
                          key={l.code}
                          className={l.code === targetLanguage ? 'lang-row active' : 'lang-row'}
                          onClick={() => { setTargetLanguage(l.code); setLangDropdownOpen(false); }}
                        >
                          <span>{l.label}</span>
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {hasTts(l.code) ? <span className="lang-tts-badge">TTS</span> : null}
                            <button
                              className="lang-action"
                              onClick={(e) => { e.stopPropagation(); removeFromMyLanguages(l.code); }}
                              title="Remove from my languages"
                            >
                              &minus;
                            </button>
                          </span>
                        </div>
                      ))}
                      <hr />
                    </>
                  ) : null}

                  {ttsFiltered.map((l) => (
                    <div
                      key={l.code}
                      className={l.code === targetLanguage ? 'lang-row active' : 'lang-row'}
                      onClick={() => { setTargetLanguage(l.code); setLangDropdownOpen(false); }}
                    >
                      <span>{l.label}</span>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span className="lang-tts-badge">TTS</span>
                        <button
                          className="lang-action"
                          onClick={(e) => { e.stopPropagation(); addToMyLanguages(l.code, l.label); }}
                          title="Add to my languages"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  ))}

                  {otherFiltered.length > 0 ? (
                    <>
                      <div className="lang-section-label">TEXT ONLY</div>
                      {otherFiltered.map((l) => (
                        <div
                          key={l.code}
                          className={l.code === targetLanguage ? 'lang-row active' : 'lang-row'}
                          onClick={() => { setTargetLanguage(l.code); setLangDropdownOpen(false); }}
                        >
                          <span>{l.label}</span>
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              className="lang-action"
                              onClick={(e) => { e.stopPropagation(); addToMyLanguages(l.code, l.label); }}
                              title="Add to my languages"
                            >
                              +
                            </button>
                          </span>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              onClick={() => { setAddingCustomLang((v) => !v); setLangDropdownOpen(false); }}
              title="Add custom language"
              style={{ fontSize: 16, padding: '4px 10px' }}
            >
              +
            </button>
          </div>

          {addingCustomLang ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 140 }} />
              <input
                className="input"
                value={customLangInput}
                onChange={(e) => setCustomLangInput(e.target.value)}
                placeholder="Language name or code..."
                style={{ flex: 1 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = customLangInput.trim();
                    if (!v) return;
                    addToMyLanguages(v.toLowerCase(), v);
                    setTargetLanguage(v.toLowerCase());
                    setCustomLangInput('');
                    setAddingCustomLang(false);
                  }
                  if (e.key === 'Escape') {
                    setAddingCustomLang(false);
                    setCustomLangInput('');
                  }
                }}
              />
              <button onClick={() => {
                const v = customLangInput.trim();
                if (!v) return;
                addToMyLanguages(v.toLowerCase(), v);
                setTargetLanguage(v.toLowerCase());
                setCustomLangInput('');
                setAddingCustomLang(false);
              }}>
                ADD
              </button>
              <button onClick={() => { setAddingCustomLang(false); setCustomLangInput(''); }}>
                CANCEL
              </button>
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12 }}>
            {hasTts(targetLanguage)
              ? 'Native TTS'
              : 'Translation only, browser audio fallback'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Span Density</div>
            <button onClick={() => setDenseSpans(false)} className={!denseSpans ? 'nav-item active' : 'nav-item'}>
              SPARSE
            </button>
            <button onClick={() => setDenseSpans(true)} className={denseSpans ? 'nav-item active' : 'nav-item'}>
              DENSE
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              {denseSpans ? '3-5 spans' : '1-2 spans'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Provider</div>
            <select
              className="input"
              value={provider.preset}
              onChange={(e) => {
                const preset = e.target.value as LlmProviderPreset;
                const d = getDefaults(preset);
                setProviderTestStatus({ state: 'idle' });
                setProvider({
                  preset,
                  apiKey: provider.apiKey ?? '',
                  baseUrl: d.baseUrl ?? provider.baseUrl ?? '',
                  model: d.model ?? provider.model ?? '',
                });
              }}
              style={{ flex: 1, minWidth: 240 }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const d = getDefaults(provider.preset);
                setProviderTestStatus({ state: 'idle' });
                setProvider({
                  ...provider,
                  baseUrl: d.baseUrl ?? provider.baseUrl ?? '',
                  model: d.model ?? provider.model ?? '',
                });
              }}
            >
              RESET
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }} />
            <button
              onClick={async () => {
                setProviderTestStatus({ state: 'running' });
                try {
                  const msg = await test_tauri_provider({
                    provider: {
                      preset: provider.preset,
                      apiKey: provider.apiKey,
                      baseUrl: provider.baseUrl,
                      model: provider.model,
                    },
                  });
                  setProviderTestStatus({ state: 'ok', message: msg });
                } catch (e) {
                  const message = e instanceof Error ? e.message : String(e);
                  setProviderTestStatus({ state: 'error', message });
                }
              }}
              disabled={providerTestStatus.state === 'running'}
            >
              {providerTestStatus.state === 'running' ? 'TESTING…' : 'TEST PROVIDER'}
            </button>
            {providerTestStatus.state === 'ok' ? (
              <div className="mono" style={{ fontSize: 12, color: 'var(--register-casual)' }}>
                OK
              </div>
            ) : providerTestStatus.state === 'error' ? (
              <div className="mono" style={{ fontSize: 12, color: 'var(--register-formal)' }}>
                ERROR
              </div>
            ) : null}
            {providerTestStatus.message ? (
              <pre className="muted" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                {providerTestStatus.message}
              </pre>
            ) : null}
          </div>

          {provider.preset !== 'anthropic' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 140 }}>Base URL</div>
              <input
                className="input"
                value={provider.baseUrl ?? ''}
                onChange={(e) => {
                  setProviderTestStatus({ state: 'idle' });
                  setProvider({ ...provider, baseUrl: e.target.value });
                }}
                placeholder={defaults.baseUrl ?? 'http://localhost:11434/v1'}
                style={{ flex: 1, minWidth: 240 }}
              />
              <button
                onClick={() => {
                  setProviderTestStatus({ state: 'idle' });
                  setProvider({ ...provider, baseUrl: '' });
                }}
              >
                CLEAR
              </button>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Model</div>
            <input
              className="input"
              value={provider.model ?? ''}
              onChange={(e) => {
                setProviderTestStatus({ state: 'idle' });
                setProvider({ ...provider, model: e.target.value });
              }}
              placeholder={defaults.model ?? ''}
              style={{ flex: 1, minWidth: 240 }}
            />
            <button
              onClick={() => {
                setProviderTestStatus({ state: 'idle' });
                setProvider({ ...provider, model: '' });
              }}
            >
              CLEAR
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>{provider.preset === 'ollama' || provider.preset === 'lmstudio' ? 'API Key (opt)' : 'API Key'}</div>
            <input
              className="input"
              value={provider.apiKey ?? ''}
              onChange={(e) => {
                setProviderTestStatus({ state: 'idle' });
                setProvider({ ...provider, apiKey: e.target.value });
              }}
              placeholder={
                provider.preset === 'anthropic'
                  ? 'ANTHROPIC_API_KEY'
                  : provider.preset === 'openai'
                    ? 'OPENAI_API_KEY'
                    : provider.preset === 'openrouter'
                      ? 'OPENROUTER_API_KEY'
                      : 'optional'
              }
              type="password"
              style={{ flex: 1, minWidth: 240 }}
            />
            <button
              onClick={() => {
                setProviderTestStatus({ state: 'idle' });
                setProvider({ ...provider, apiKey: '' });
              }}
              disabled={!provider.apiKey}
            >
              CLEAR
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            {provider.preset === 'ollama'
              ? `OpenAI-compatible local server. Default: ${effectiveBaseUrl}`
              : provider.preset === 'lmstudio'
                ? `OpenAI-compatible local server. Default: ${effectiveBaseUrl}`
                : provider.preset === 'openrouter'
                  ? 'Uses Authorization: Bearer <OPENROUTER_API_KEY> and base URL https://openrouter.ai/api/v1'
                  : provider.preset === 'openai'
                    ? 'Uses Authorization: Bearer <OPENAI_API_KEY> and base URL https://api.openai.com/v1'
                    : provider.preset === 'anthropic'
                      ? 'Uses x-api-key: <ANTHROPIC_API_KEY>'
                      : 'OpenAI-compatible: configure base URL, model, and (optional) key.'}
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 720, marginTop: 16 }}>
        <div className="panel-header">Audio</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>TTS Model</div>
            {audioStatus.ready ? (
              <div className="mono" style={{ fontSize: 12, color: 'var(--register-casual)' }}>
                READY
              </div>
            ) : audioStatus.loading ? (
              <div className="mono" style={{ fontSize: 12 }}>
                LOADING...
              </div>
            ) : audioStatus.downloaded ? (
              <div className="mono" style={{ fontSize: 12 }}>
                DOWNLOADED
              </div>
            ) : (
              <button onClick={onDownloadModel}>DOWNLOAD</button>
            )}
            {audioStatus.modelSizeBytes != null && (
              <div className="muted" style={{ fontSize: 12 }}>
                {(audioStatus.modelSizeBytes / 1024 / 1024).toFixed(0)} MB
              </div>
            )}
            {audioStatus.error && (
              <div style={{ fontSize: 12, color: 'var(--register-vulgar)' }}>
                {audioStatus.error}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Speed</div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={audioSpeed}
              onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
              style={{ width: 160 }}
            />
            <div className="mono" style={{ fontSize: 12, minWidth: 36, textAlign: 'right' }}>
              {audioSpeed.toFixed(1)}x
            </div>
            {audioSpeed !== 1.0 && (
              <button onClick={() => setAudioSpeed(1.0)} style={{ fontSize: 11 }}>
                RESET
              </button>
            )}
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            {audioStatus.ready
              ? 'Kokoro TTS ready. Supports EN, FR, ES, JA, ZH, IT, PT, HI natively.'
              : 'Download Kokoro-82M (~350MB) for native TTS. Browser SpeechSynthesis used as fallback until then.'}
          </div>
        </div>
      </div>

      <UpdatePanel currentVersion={appVersion} />
    </div>
  );
}
