/** Client for the Morrow server. Failures come back as plain sentences with a next step. */

export const WORKER_URL: string = process.env["NEXT_PUBLIC_WORKER_URL"] ?? "";
const KEY = "morrow.key";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getKey(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setKey(value: string | null): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("morrow-key"));
  } catch {
    // Storage can be blocked; the app then asks for the key again each visit.
  }
}

export function subscribeKey(cb: () => void): () => void {
  window.addEventListener("morrow-key", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("morrow-key", cb);
    window.removeEventListener("storage", cb);
  };
}

function plain(status: number, serverMessage: string | null): string {
  if (status === 401) return "Your access key was not accepted. Check it on the Connect screen.";
  if (status === 503) return serverMessage ?? "The Morrow server is not ready yet.";
  if (serverMessage) return serverMessage;
  return "Morrow could not reach its server. Check your connection and try again.";
}

export async function request<T>(path: string, init: { method?: string; body?: unknown; key?: string | null; baseUrl?: string } = {}): Promise<T> {
  const base = init.baseUrl ?? WORKER_URL;
  if (!base) throw new ApiError("This site is not linked to a Morrow server yet.", 0);
  const key = init.key === undefined ? getKey() : init.key;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(plain(0, null), 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body !== null ? ((body as { error?: string; line?: string }).error ?? (body as { line?: string }).line ?? null) : null;
    throw new ApiError(plain(res.status, msg), res.status);
  }
  return body as T;
}
