/* Simple API helper , stores the login token in localStorage */

const TOKEN_KEY = "vetta_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function isAuthPage() {
  return (
    typeof window !== "undefined" &&
    /^\/(login|signup|forgot-password|reset-password)\/?$/.test(window.location.pathname)
  );
}

/** Clear token and send user to login (no-op on auth pages). */
export function redirectToLoginOnUnauthorized() {
  setToken(null);
  if (!isAuthPage() && typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

/** Build a readable error from an HTTP response + optional JSON body. */
export function formatApiError(res, data) {
  const raw = data && (data.detail || data.message || data.error);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw != null && typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      /* fall through */
    }
  }
  if (res.status === 401) return "Please log in again.";
  if (res.status === 403) return "You don't have permission to do that.";
  if (res.status === 404) return "Not found.";
  if (res.status >= 500) return `Server error (${res.status}). Try again.`;
  if (res.status) return `Request failed (${res.status})`;
  return "Request failed";
}

/** Parse JSON if possible; otherwise null (e.g. HTML 500 pages). */
export async function readResponseJson(res) {
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token && !headers.Authorization && !headers.authorization) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await readResponseJson(res);

  if (!res.ok) {
    if (res.status === 401) {
      redirectToLoginOnUnauthorized();
    }
    throw new Error(formatApiError(res, data));
  }
  return data;
}
