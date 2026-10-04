import type { LoginResponse } from "@/lib/auth";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function getAuthState() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("tectomi-auth") || window.localStorage.getItem("nuro7-auth");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { state?: { accessToken?: string | null; refreshToken?: string | null } }).state ?? null;
  } catch {
    return null;
  }
}

function getAccessToken() {
  return getAuthState()?.accessToken ?? null;
}

function getRefreshToken() {
  return getAuthState()?.refreshToken ?? null;
}

function updateAccessToken(newToken: string) {
  if (typeof window === "undefined") return;
  const key = window.localStorage.getItem("tectomi-auth") ? "tectomi-auth" : "nuro7-auth";
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    parsed.state.accessToken = newToken;
    window.localStorage.setItem("tectomi-auth", JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("tectomi-auth");
  window.localStorage.removeItem("nuro7-auth");
  window.location.href = "/login";
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { accessToken: string };
      updateAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  // If 401, try refreshing the token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });

      if (retryResponse.ok) {
        return retryResponse.json() as Promise<T>;
      }
    }

    // Refresh failed — session is dead, redirect to login
    clearAuth();
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    try {
      // The API error envelope looks like:
      //   { success: false, error: { message, error, statusCode }, path, timestamp }
      // OR, for fallback non-HttpException crashes:
      //   { success: false, error: "Internal server error", ... }
      // Older/raw shapes like { message } are also handled as a last resort.
      const errBody = await response.json() as {
        error?: { message?: string | string[] } | string;
        message?: string | string[];
      };

      const nested = typeof errBody.error === "object" ? errBody.error?.message : undefined;
      const raw = nested ?? errBody.message ?? (typeof errBody.error === "string" ? errBody.error : undefined);
      const msg = Array.isArray(raw) ? raw.join(", ") : raw;

      throw new Error(msg || `API request failed for ${path}`);
    } catch (e) {
      if (e instanceof Error && e.message && !e.message.startsWith("API request")) throw e;
      throw new Error(`API request failed for ${path}`);
    }
  }

  // Handle empty bodies (e.g. endpoints that legitimately return null / 204 No Content).
  // Safari's response.json() throws "The string did not match the expected pattern" on empty bodies.
  if (response.status === 204) return null as unknown as T;
  const text = await response.text();
  if (!text) return null as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as unknown as T;
  }
}

export async function apiFetchForm<T>(path: string, body: FormData): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body,
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body,
      });
      if (retryResponse.ok) return retryResponse.json() as Promise<T>;
    }
    clearAuth();
    throw new Error("Session expired.");
  }

  if (!response.ok) {
    throw new Error(`API form request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
  });
}

export async function loginRequest(email: string, password: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid login credentials.");
  }

  return response.json() as Promise<LoginResponse>;
}

export async function logoutRequest(refreshToken: string) {
  return apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function downloadWithAuth(path: string, filename: string) {
  const accessToken = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (!response.ok) {
    // Surface the backend's actual error message so the user sees "Project not found"
    // etc. rather than a generic "Unable to download".
    let msg = `Unable to download ${filename} (${response.status}).`;
    try {
      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = await response.json();
        msg = body?.message ?? body?.error?.message ?? msg;
      } else {
        const text = await response.text();
        if (text) msg = text.slice(0, 200);
      }
    } catch {
      // keep default msg
    }
    throw new Error(msg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
