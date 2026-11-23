export class PatronRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function patronRequest<T>(path: string, key: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-API-Key', key);
  const response = await fetch('/api/' + path, { ...options, headers, redirect: 'error', cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new PatronRequestError(response.status, typeof body.detail === 'string' ? body.detail : 'Patron could not complete the request.');
  }
  return response.json();
}
