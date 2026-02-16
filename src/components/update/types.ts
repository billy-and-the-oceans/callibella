/** How often to automatically check for updates */
export type CheckFrequency = 'startup' | 'daily' | 'weekly' | 'never';

/** Importance level for updates */
export type UpdateImportance = 'normal' | 'important' | 'critical';

/** Current state of the update process */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

/** User preferences for update behavior */
export interface UpdatePreferences {
  autoCheckEnabled: boolean;
  checkFrequency: CheckFrequency;
  autoDownloadEnabled: boolean;
  notifyOnUpdate: boolean;
  lastChecked: string | null;
  dismissedVersion: string | null;
}

/** Information about an available update */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string;
  publishedAt: string;
  importance: UpdateImportance;
  downloadSize?: number;
}

/** Context value for the UpdateProvider */
export interface UpdateContextValue {
  status: UpdateStatus;
  update: UpdateInfo | null;
  preferences: UpdatePreferences;
  error: string | null;
  downloadProgress: number;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setPreferences: (prefs: Partial<UpdatePreferences>) => void;
  dismissUpdate: () => void;
}

export const DEFAULT_PREFERENCES: UpdatePreferences = {
  autoCheckEnabled: true,
  checkFrequency: 'startup',
  autoDownloadEnabled: false,
  notifyOnUpdate: true,
  lastChecked: null,
  dismissedVersion: null,
};
