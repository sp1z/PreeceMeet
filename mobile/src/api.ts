// Mirror of app/src/api.ts subset — kept inline (not shared) so each platform
// can evolve its surface independently. Keep field names identical.

export class UnauthorizedError extends Error {
  constructor() { super('Session expired. Please sign in again.'); this.name = 'UnauthorizedError'; }
}

export interface LoginResult {
  requireTotp: boolean;
  tempToken:   string;
  totpSetup?:  boolean;
  totpSecret?: string;
  otpUri?:     string;
}

export interface SessionResult {
  livekitToken: string;
  livekitUrl:   string;
  sessionToken: string;
  isAdmin:      boolean;
}

export interface RoomInfo {
  name:             string;
  numParticipants:  number;
  participantNames: string[];
}

export interface ContactUser { email: string; online: boolean; }

export interface Channel { name: string; displayName: string; emoji: string; }

export async function login(serverUrl: string, email: string, password: string): Promise<LoginResult> {
  const resp = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (resp.status === 401) throw new Error('Invalid email or password.');
  if (!resp.ok) throw new Error(`Login failed (${resp.status})`);
  return resp.json();
}

export async function verifyTotp(serverUrl: string, tempToken: string, code: string): Promise<SessionResult> {
  const resp = await fetch(`${serverUrl}/api/auth/verify-totp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, code }),
  });
  if (resp.status === 401) throw new Error('Invalid code. Please try again.');
  if (!resp.ok) throw new Error(`Verification failed (${resp.status})`);
  const data = await resp.json();
  return { ...data, isAdmin: data.isAdmin ?? false };
}

export async function getRooms(serverUrl: string, sessionToken: string): Promise<RoomInfo[]> {
  const resp = await fetch(`${serverUrl}/api/rooms`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) return [];
  return resp.json();
}

export async function getRoomToken(serverUrl: string, sessionToken: string, room: string, name?: string) {
  const params = new URLSearchParams({ room });
  if (name) params.set('name', name);
  const resp = await fetch(`${serverUrl}/api/rooms/token?${params}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to get room token (${resp.status})`);
  return resp.json() as Promise<{ livekitToken: string; livekitUrl: string }>;
}

export async function uploadLogs(
  serverUrl:     string,
  sessionToken:  string,
  lines:         string[],
  clientVersion: string,
  platform:      string,
): Promise<boolean> {
  if (!lines.length) return true;
  try {
    const resp = await fetch(`${serverUrl}/api/logs/upload`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lines, clientVersion, platform }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function getChannels(serverUrl: string, sessionToken: string): Promise<Channel[]> {
  const resp = await fetch(`${serverUrl}/api/channels`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) return [];
  return resp.json();
}

export async function getUsers(serverUrl: string, sessionToken: string): Promise<ContactUser[]> {
  const resp = await fetch(`${serverUrl}/api/users`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to list users (${resp.status})`);
  return resp.json();
}

export async function registerDevice(
  serverUrl:    string,
  sessionToken: string,
  token:        string,
  platform:     'ios' | 'android',
): Promise<boolean> {
  try {
    const resp = await fetch(`${serverUrl}/api/devices`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, platform }),
    });
    return resp.ok;
  } catch { return false; }
}

export async function unregisterDevice(
  serverUrl:    string,
  sessionToken: string,
  token:        string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${serverUrl}/api/devices/${encodeURIComponent(token)}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return resp.ok;
  } catch { return false; }
}
