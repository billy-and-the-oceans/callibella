import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import type {
  UpdateContextValue,
  UpdatePreferences,
  UpdateInfo,
  UpdateStatus,
  UpdateImportance,
} from './types';
import { DEFAULT_PREFERENCES } from './types';

const STORAGE_KEY = 'callibella-update-preferences';

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

export function useUpdate(): UpdateContextValue {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
}

interface UpdateProviderProps {
  children: ReactNode;
  currentVersion: string;
  appName: string;
  checkOnMount?: boolean;
}

export function UpdateProvider({
  children,
  currentVersion,
  appName,
  checkOnMount = true,
}: UpdateProviderProps) {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [preferences, setPreferencesState] = useState<UpdatePreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {}
    return DEFAULT_PREFERENCES;
  });

  const hasCheckedRef = useRef(false);
  const tauriUpdateRef = useRef<unknown>(null);

  const setPreferences = useCallback((prefs: Partial<UpdatePreferences>) => {
    setPreferencesState((prev) => {
      const next = { ...prev, ...prefs };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');
    setError(null);

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const result = await check();

      setPreferences({ lastChecked: new Date().toISOString() });

      if (result) {
        tauriUpdateRef.current = result;

        let importance: UpdateImportance = 'normal';
        const importanceMatch = result.body?.match(/<!--\s*importance:\s*(\w+)\s*-->/i);
        if (importanceMatch) {
          const level = importanceMatch[1].toLowerCase();
          if (level === 'critical' || level === 'important') {
            importance = level;
          }
        }

        const updateInfo: UpdateInfo = {
          version: result.version,
          currentVersion,
          notes: result.body || 'No release notes available.',
          publishedAt: result.date || new Date().toISOString(),
          importance,
        };

        setUpdate(updateInfo);
        setStatus('available');
        console.log(`[${appName}] Update available: ${result.version}`);
      } else {
        setUpdate(null);
        setStatus('idle');
        console.log(`[${appName}] No updates available`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error checking for updates';
      setError(message);
      setStatus('error');
      console.error(`[${appName}] Update check failed:`, err);
    }
  }, [currentVersion, appName, setPreferences]);

  const downloadUpdate = useCallback(async () => {
    if (!tauriUpdateRef.current) {
      setError('No update available to download');
      return;
    }

    setStatus('downloading');
    setDownloadProgress(0);
    setError(null);

    try {
      const tauriUpdate = tauriUpdateRef.current as {
        download: (onProgress?: (progress: { contentLength?: number; chunkLength: number }) => void) => Promise<void>;
      };

      let downloaded = 0;

      await tauriUpdate.download((progress) => {
        downloaded += progress.chunkLength;
        if (progress.contentLength) {
          const percent = Math.round((downloaded / progress.contentLength) * 100);
          setDownloadProgress(percent);
        }
      });

      setDownloadProgress(100);
      setStatus('ready');
      console.log(`[${appName}] Update downloaded, ready to install`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error downloading update';
      setError(message);
      setStatus('error');
      console.error(`[${appName}] Update download failed:`, err);
    }
  }, [appName]);

  const installUpdate = useCallback(async () => {
    if (!tauriUpdateRef.current) {
      setError('No update ready to install');
      return;
    }

    try {
      const tauriUpdate = tauriUpdateRef.current as {
        install: () => Promise<void>;
      };

      console.log(`[${appName}] Installing update and restarting...`);
      await tauriUpdate.install();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error installing update';
      setError(message);
      setStatus('error');
      console.error(`[${appName}] Update install failed:`, err);
    }
  }, [appName]);

  const dismissUpdate = useCallback(() => {
    if (update) {
      setPreferences({ dismissedVersion: update.version });
    }
  }, [update, setPreferences]);

  // Auto-check on mount
  useEffect(() => {
    if (!checkOnMount || hasCheckedRef.current) return;

    if (!preferences.autoCheckEnabled || preferences.checkFrequency === 'never') {
      return;
    }

    if (preferences.checkFrequency === 'startup') {
      hasCheckedRef.current = true;
      checkForUpdates();
      return;
    }

    if (preferences.lastChecked) {
      const lastCheck = new Date(preferences.lastChecked);
      const now = new Date();
      const hoursSinceCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);

      const shouldCheck =
        (preferences.checkFrequency === 'daily' && hoursSinceCheck >= 24) ||
        (preferences.checkFrequency === 'weekly' && hoursSinceCheck >= 168);

      if (shouldCheck) {
        hasCheckedRef.current = true;
        checkForUpdates();
      }
    } else {
      hasCheckedRef.current = true;
      checkForUpdates();
    }
  }, [checkOnMount, preferences, checkForUpdates]);

  // Auto-download if enabled
  useEffect(() => {
    if (
      status === 'available' &&
      preferences.autoDownloadEnabled &&
      update &&
      update.version !== preferences.dismissedVersion
    ) {
      downloadUpdate();
    }
  }, [status, preferences.autoDownloadEnabled, preferences.dismissedVersion, update, downloadUpdate]);

  const value: UpdateContextValue = {
    status,
    update,
    preferences,
    error,
    downloadProgress,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    setPreferences,
    dismissUpdate,
  };

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  );
}
