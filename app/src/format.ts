// Display formatting helpers.
//
// Prefer display name. Fall back to local-part of email ("alice@x" → "alice").
// Final fallback: the raw email. This keeps UI readable even when the server
// doesn't know a user's display name (the only identity we're guaranteed to
// have is their email).

export function formatUser(email: string | undefined | null, displayName?: string | null): string {
  const name = displayName?.trim();
  if (name) return name;
  const e = email?.trim() || '';
  if (e.includes('@')) return e.split('@')[0];
  return e;
}
