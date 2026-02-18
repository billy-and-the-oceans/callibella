import { invoke } from '@tauri-apps/api/core';
import type { Story } from './bokaTypes';

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || '__TAURI__' in (window as any))
  );
}

export async function readStoriesFromFile(): Promise<Story[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const result = await invoke<Story[]>('boka_read_stories');
    return result;
  } catch (e) {
    console.warn('[boka] Failed to read stories from file:', e);
    return null;
  }
}

export async function writeStoriesToFile(stories: Story[]): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    await invoke('boka_write_stories', { stories });
    return true;
  } catch (e) {
    console.warn('[boka] Failed to write stories to file:', e);
    return false;
  }
}
