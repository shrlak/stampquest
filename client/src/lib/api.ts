// True for the static build (GitHub Pages demo): data lives in localStorage
// via localBackend.ts instead of the Node API. Statically replaced at build
// time, so the unused code path is eliminated from the bundle.
export const IS_LOCAL_BACKEND = import.meta.env.VITE_BACKEND === 'local';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public data: Record<string, unknown>,
  ) {
    super(code);
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  if (IS_LOCAL_BACKEND) {
    const { localRequest } = await import('./localBackend');
    const { status, data } = await localRequest(path, method, body);
    if (status >= 400) {
      const d = data as Record<string, unknown>;
      throw new ApiError(status, typeof d.error === 'string' ? d.error : 'UNKNOWN', d);
    }
    return data as T;
  }

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'UNKNOWN', data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
};

/** SQLite's datetime('now') is UTC without a timezone marker. */
export function parseServerDate(s: string): Date {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

export function formatCollectedDate(s: string): string {
  return parseServerDate(s).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
