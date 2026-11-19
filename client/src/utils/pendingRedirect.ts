/**
 * Remembers where to send the user after they sign in (e.g. a share link that requires sign-in).
 * Only in-app paths are accepted, so this can never redirect to another website.
 */
let pending: string | null = null;

export function setPendingRedirect(path: string) {
  pending = path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export function takePendingRedirect(): string | null {
  const value = pending;
  pending = null;
  return value;
}
