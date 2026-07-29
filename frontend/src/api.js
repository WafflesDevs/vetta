/* Simple API helper , stores the login token in localStorage */

const TOKEN_KEY = "vetta_token";

export function getToken() {
 return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
 if (token) localStorage.setItem(TOKEN_KEY, token);
 else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
 const headers = { ...(options.headers || {}) };
 const token = getToken();

 if (!(options.body instanceof FormData)) {
 headers["Content-Type"] = "application/json";
 }
 if (token) headers["Authorization"] = `Bearer ${token}`;

 const res = await fetch(path, { ...options, headers });
 let data = null;
 try {
 data = await res.json();
 } catch {
 data = null;
 }

 if (!res.ok) {
 const msg = (data && (data.detail || data.message)) || "Request failed";
 throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
 }
 return data;
}
