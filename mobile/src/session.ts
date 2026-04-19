// Persistent session storage using expo-secure-store (Keychain on iOS, Keystore on Android).

import * as SecureStore from 'expo-secure-store';

export interface Session {
  email:        string;
  sessionToken: string;
  serverUrl:    string;
  isAdmin:      boolean;
}

const KEY = 'preecemeet.session';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

const SERVER_KEY = 'preecemeet.serverUrl';
const DEFAULT_SERVER = 'https://meet.russellpreece.com';

export async function loadServerUrl(): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(SERVER_KEY);
    return v || DEFAULT_SERVER;
  } catch { return DEFAULT_SERVER; }
}

export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SERVER_KEY, url);
}
