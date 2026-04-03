import type { RoomInfo } from './types';

export interface LoginResult {
  requireTotp: boolean;
  tempToken: string;
  totpSetup?: boolean;
  totpSecret?: string;
  otpUri?: string;
}

export interface SessionResult {
  livekitToken: string;
  livekitUrl: string;
  sessionToken: string;
}

export interface RoomTokenResult {
  livekitToken: string;
  livekitUrl: string;
}

export async function login(serverUrl: string, email: string, password: string): Promise<LoginResult> {
  const resp = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (resp.status === 401) throw new Error('Invalid email or password.');
  if (!resp.ok) throw new Error(`Login failed (${resp.status})`);
  return resp.json();
}

export async function verifyTotp(serverUrl: string, tempToken: string, code: string): Promise<SessionResult> {
  const resp = await fetch(`${serverUrl}/api/auth/verify-totp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, code }),
  });
  if (resp.status === 401) throw new Error('Invalid code. Please try again.');
  if (!resp.ok) throw new Error(`Verification failed (${resp.status})`);
  return resp.json();
}

export async function getRooms(serverUrl: string, sessionToken: string): Promise<RoomInfo[]> {
  try {
    const resp = await fetch(`${serverUrl}/api/rooms`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!resp.ok) return [];
    return resp.json();
  } catch { return []; }
}

export async function getRoomToken(
  serverUrl: string,
  sessionToken: string,
  room: string,
  displayName?: string,
): Promise<RoomTokenResult> {
  const params = new URLSearchParams({ room });
  if (displayName) params.set('name', displayName);
  const resp = await fetch(`${serverUrl}/api/rooms/token?${params}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to get room token (${resp.status})`);
  return resp.json();
}
