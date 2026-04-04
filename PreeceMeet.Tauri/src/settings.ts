import type { Settings, Session } from './types';

const SETTINGS_KEY = 'preecemeet_settings';
const SESSION_KEY  = 'preecemeet_session';

const defaults: Settings = {
  serverUrl: 'https://meet.russellpreece.com',
  savedEmail: '',
  displayName: '',
  rememberMe: false,
  channels: [{ name: 'preecemeet', displayName: 'General', emoji: '💬' }],
  autoJoinChannel: '',
  sidebarVisible: true,
  preferredMicDeviceId: '',
  preferredCamDeviceId: '',
  preferredSpeakerDeviceId: '',
  sidebarWidth: 220,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaults };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
