import { useUpdate } from './UpdateContext';
import type { CheckFrequency } from './types';

const CHECK_FREQUENCY_OPTIONS: { value: CheckFrequency; label: string }[] = [
  { value: 'startup', label: 'On startup' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'never', label: 'Never' },
];

function formatDate(isoString: string | null): string {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export default function UpdatePanel({ currentVersion }: { currentVersion: string }) {
  const {
    status,
    update,
    preferences,
    error,
    downloadProgress,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    setPreferences,
  } = useUpdate();

  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';
  const isReady = status === 'ready';
  const hasUpdate = status === 'available' || isDownloading || isReady;
  const hasError = status === 'error';

  return (
    <div className="panel" style={{ maxWidth: 720, marginTop: 16 }}>
      <div className="panel-header">Updates</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Version */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }}>Version</div>
          <div className="mono" style={{ fontSize: 12 }}>v{currentVersion}</div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }}>Status</div>
          {isChecking && (
            <div className="mono" style={{ fontSize: 12 }}>CHECKING...</div>
          )}
          {hasError && (
            <div className="mono" style={{ fontSize: 12, color: 'var(--register-vulgar)' }}>
              {error || 'Failed to check for updates'}
            </div>
          )}
          {!hasUpdate && !isChecking && !hasError && (
            <div className="mono" style={{ fontSize: 12, color: 'var(--register-casual)' }}>
              UP TO DATE
            </div>
          )}
          {hasUpdate && update && (
            <div className="mono" style={{ fontSize: 12 }}>
              v{update.version} AVAILABLE
              {update.importance !== 'normal' && (
                <span style={{
                  marginLeft: 8,
                  padding: '1px 4px',
                  border: '1px solid currentColor',
                  fontSize: 10,
                  color: update.importance === 'critical' ? 'var(--register-vulgar)' : 'var(--register-colloquial)',
                }}>
                  {update.importance === 'critical' ? 'CRITICAL' : 'IMPORTANT'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Update details */}
        {hasUpdate && update && (
          <>
            {update.notes && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 140 }} />
                <div className="muted" style={{ fontSize: 12 }}>
                  {update.notes.replace(/<!--.*?-->/g, '').trim().slice(0, 200)}
                  {update.notes.length > 200 ? '...' : ''}
                </div>
              </div>
            )}

            {isDownloading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 140 }} />
                <div style={{
                  flex: 1,
                  height: 4,
                  border: '1px solid var(--line)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${downloadProgress}%`,
                    background: 'var(--fg)',
                    transition: 'width 0.2s',
                  }} />
                </div>
                <div className="mono" style={{ fontSize: 12, minWidth: 36, textAlign: 'right' }}>
                  {downloadProgress}%
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 140 }} />
              {status === 'available' && (
                <button onClick={downloadUpdate}>DOWNLOAD</button>
              )}
              {isReady && (
                <button onClick={installUpdate}>INSTALL & RESTART</button>
              )}
            </div>
          </>
        )}

        {/* Check button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }} />
          <button
            onClick={checkForUpdates}
            disabled={isChecking || isDownloading}
          >
            {isChecking ? 'CHECKING...' : 'CHECK NOW'}
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            Last checked: {formatDate(preferences.lastChecked)}
          </div>
        </div>

        <hr />

        {/* Auto-check */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }}>Auto-check</div>
          <button
            onClick={() => setPreferences({ autoCheckEnabled: true })}
            className={preferences.autoCheckEnabled ? 'nav-item active' : 'nav-item'}
          >
            ON
          </button>
          <button
            onClick={() => setPreferences({ autoCheckEnabled: false })}
            className={!preferences.autoCheckEnabled ? 'nav-item active' : 'nav-item'}
          >
            OFF
          </button>
        </div>

        {/* Frequency */}
        {preferences.autoCheckEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140 }}>Frequency</div>
            <select
              className="input"
              value={preferences.checkFrequency}
              onChange={(e) =>
                setPreferences({ checkFrequency: e.target.value as CheckFrequency })
              }
              style={{ minWidth: 160 }}
            >
              {CHECK_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Auto-download */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }}>Auto-download</div>
          <button
            onClick={() => setPreferences({ autoDownloadEnabled: true })}
            className={preferences.autoDownloadEnabled ? 'nav-item active' : 'nav-item'}
          >
            ON
          </button>
          <button
            onClick={() => setPreferences({ autoDownloadEnabled: false })}
            className={!preferences.autoDownloadEnabled ? 'nav-item active' : 'nav-item'}
          >
            OFF
          </button>
        </div>
      </div>
    </div>
  );
}
