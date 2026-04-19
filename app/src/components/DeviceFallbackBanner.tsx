import type { DeviceKind } from '../pages/MainPage';

const LABELS: Record<DeviceKind, string> = {
  mic:     'microphone',
  cam:     'camera',
  speaker: 'speaker',
};

function summarise(failures: DeviceKind[]): string {
  const parts = failures.map(k => LABELS[k]);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

interface Props {
  failures:        DeviceKind[];
  onRetry:         () => void;
  onOpenSettings:  () => void;
}

export default function DeviceFallbackBanner({ failures, onRetry, onOpenSettings }: Props) {
  if (failures.length === 0) return null;
  const noun  = summarise(failures);
  const verb  = failures.length === 1 ? 'is' : 'are';
  return (
    <div className="device-fallback-banner" role="status">
      <span className="device-fallback-icon">⚠</span>
      <span className="device-fallback-text">
        Preferred {noun} {verb} not available — using the system default.
      </span>
      <button className="btn-secondary device-fallback-btn" onClick={onRetry} title="Re-apply preferred devices">
        Retry
      </button>
      <button className="btn-secondary device-fallback-btn" onClick={onOpenSettings} title="Pick a different device">
        Settings
      </button>
    </div>
  );
}
