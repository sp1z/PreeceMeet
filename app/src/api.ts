import type { RoomInfo } from './types';

export class UnauthorizedError extends Error {
  constructor() { super('Session expired. Please sign in again.'); this.name = 'UnauthorizedError'; }
}

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
  isAdmin: boolean;
}

export interface RoomTokenResult {
  livekitToken: string;
  livekitUrl: string;
}

export interface AdminUser {
  email: string;
  totpConfigured: boolean;
  createdAt: string;
  isAdmin: boolean;
}

export interface CreateUserResult {
  email: string;
  otpUri: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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
  const data = await resp.json();
  return { ...data, isAdmin: data.isAdmin ?? false };
}

export async function getMe(serverUrl: string, sessionToken: string): Promise<{ email: string; isAdmin: boolean }> {
  const resp = await fetch(`${serverUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to fetch profile (${resp.status})`);
  return resp.json();
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export async function getRooms(serverUrl: string, sessionToken: string): Promise<RoomInfo[]> {
  try {
    const resp = await fetch(`${serverUrl}/api/rooms`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (resp.status === 401) throw new UnauthorizedError();
    if (!resp.ok) return [];
    return resp.json();
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    return [];
  }
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
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to get room token (${resp.status})`);
  return resp.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function adminHeaders(sessionToken: string) {
  return { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
}

export async function adminGetUsers(serverUrl: string, sessionToken: string): Promise<AdminUser[]> {
  const resp = await fetch(`${serverUrl}/api/admin/users`, {
    headers: adminHeaders(sessionToken),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to list users (${resp.status})`);
  return resp.json();
}

export async function adminCreateUser(serverUrl: string, sessionToken: string, email: string, password: string): Promise<CreateUserResult> {
  const resp = await fetch(`${serverUrl}/api/admin/users`, {
    method: 'POST',
    headers: adminHeaders(sessionToken),
    body: JSON.stringify({ email, password }),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (resp.status === 409) throw new Error('A user with that email already exists.');
  if (!resp.ok) throw new Error(`Failed to create user (${resp.status})`);
  return resp.json();
}

export async function adminDeleteUser(serverUrl: string, sessionToken: string, email: string): Promise<void> {
  const resp = await fetch(`${serverUrl}/api/admin/users/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: adminHeaders(sessionToken),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to delete user (${resp.status})`);
}

export async function adminChangePassword(serverUrl: string, sessionToken: string, email: string, password: string): Promise<void> {
  const resp = await fetch(`${serverUrl}/api/admin/users/${encodeURIComponent(email)}/password`, {
    method: 'PATCH',
    headers: adminHeaders(sessionToken),
    body: JSON.stringify({ password }),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to change password (${resp.status})`);
}

export async function adminResetTotp(serverUrl: string, sessionToken: string, email: string): Promise<void> {
  const resp = await fetch(`${serverUrl}/api/admin/users/${encodeURIComponent(email)}/reset-totp`, {
    method: 'POST',
    headers: adminHeaders(sessionToken),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to reset TOTP (${resp.status})`);
}

export async function adminSetAdmin(serverUrl: string, sessionToken: string, email: string, isAdmin: boolean): Promise<void> {
  const resp = await fetch(`${serverUrl}/api/admin/users/${encodeURIComponent(email)}/is-admin`, {
    method: 'PATCH',
    headers: adminHeaders(sessionToken),
    body: JSON.stringify({ isAdmin }),
  });
  if (resp.status === 401) throw new UnauthorizedError();
  if (!resp.ok) throw new Error(`Failed to update admin status (${resp.status})`);
}
