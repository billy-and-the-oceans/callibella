export const TTS_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'en-gb', label: 'English (GB)' },
];

export const OTHER_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'de', label: 'German' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'tr', label: 'Turkish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },
];

export const ALL_LANGUAGES = [...TTS_LANGUAGES, ...OTHER_LANGUAGES];

export function hasTts(code: string): boolean {
  return TTS_LANGUAGES.some((l) => l.code === code);
}

export function languageLabel(code: string): string {
  const found = ALL_LANGUAGES.find((l) => l.code === code);
  return found?.label ?? code;
}

export function loadMyLanguages(): Array<{ code: string; label: string }> {
  try {
    const raw = localStorage.getItem('boka.myLanguages');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}
