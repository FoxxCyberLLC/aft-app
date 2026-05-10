// AFT CSRF helper.
//
// The Bun server enforces an X-CSRF-Token header on every non-idempotent HTTP
// method (POST/PUT/PATCH/DELETE) - see middleware/role-middleware.ts. Login
// sets a JS-readable `csrf` cookie alongside the HttpOnly session cookie
// (server/api/auth-api.ts), and the client is expected to echo that cookie
// value back in the header.
//
// Every page-rendering route in this app emits inline <script> blocks that
// call `fetch('/api/...')` directly. Rather than patch each call site, this
// module monkey-patches window.fetch so every same-origin request that mutates
// state automatically carries the CSRF header.
//
// Loaded by every page wrapper that emits its own <head> (server/utils.ts,
// lib/component-builder.ts, login-page.ts, role-selection-page.ts,
// middleware/role-middleware.ts, server/routes/dta-routes.ts).

(() => {
  const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  function readCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function isSameOrigin(url) {
    try {
      // Treat all relative URLs as same-origin.
      if (typeof url !== 'string') {
        if (url instanceof Request) {
          return new URL(url.url, location.origin).origin === location.origin;
        }
        return new URL(String(url), location.origin).origin === location.origin;
      }
      if (url.startsWith('/') && !url.startsWith('//')) return true;
      return new URL(url, location.origin).origin === location.origin;
    } catch {
      return false;
    }
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function aftFetch(input, init) {
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (!UNSAFE_METHODS.has(method)) return originalFetch(input, init);
    if (!isSameOrigin(input)) return originalFetch(input, init);

    const token = readCsrfToken();
    if (!token) return originalFetch(input, init);

    const nextInit = init ? { ...init } : {};
    const headers = new Headers(nextInit.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
    nextInit.headers = headers;

    return originalFetch(input, nextInit);
  };
})();
