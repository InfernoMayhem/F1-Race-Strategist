// backend base discovery and fetch wrapper

const IS_DEV_OR_FILE = typeof window === 'undefined' || !window.location ? false :
  (window.location.protocol === 'file:' ? true :
  ['5173', '5174', '4173', '4174'].includes(window.location.port));

// allow explicit override via window.__BACKEND_BASE__
const EXPLICIT_BASE = (typeof window !== 'undefined' && window.__BACKEND_BASE__)
  ? window.__BACKEND_BASE__.trim()
  : '';

// cache the working base url so it doesn't scan every time
let cachedBaseUrl = null;

// helper to find the running backend and attempts to locate the running backend server
async function getBaseUrl() {
  if (cachedBaseUrl !== null) return cachedBaseUrl;

  if (EXPLICIT_BASE) {
    cachedBaseUrl = EXPLICIT_BASE;
    return cachedBaseUrl;
  }

  // in production, the frontend is served by the backend, so the base is just root
  if (!IS_DEV_OR_FILE) {
    cachedBaseUrl = ''; 
    return cachedBaseUrl;
  }

  // list of likely ports where the backend might be running
  const ports = [
    5500, 5501, 5502, 5503, 5504, 5505, 5506, 5507, 5508, 5509, 5510,
    5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010
  ];

  console.log('[API] Scanning for backend...', ports);

  // try to ping each port to see if our backend is listening there
  for (const port of ports) {
    const candidate = `http://localhost:${port}`;
    try {
      const controller = new AbortController();
      // short timeout to fail fast if port is closed
      const id = setTimeout(() => controller.abort(), 500); 
      const res = await fetch(`${candidate}/api/hello`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        console.log(`[API] Found backend at ${candidate}`);
        cachedBaseUrl = candidate;
        return candidate;
      }
    } catch (e) {
      // ignore connection errors and continue scanning
    }
  }

  console.warn('[API] Could not find running backend. Defaulting to relative.');
  cachedBaseUrl = ''; // fallback to relative if nothing found, probably won't work in dev but safe for prod
  return ''; 
}

// wrapper for the native fetch api that automatically resolves the correct backend url
export async function apiFetch(endpoint, options = {}) {
  const baseUrl = await getBaseUrl();
  
  // ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // construct the full url
  const url = baseUrl ? `${baseUrl}${path}` : path;

  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    console.error(`[API] Fetch failed for ${url}`, err);
    throw err;
  }
}
