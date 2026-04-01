import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

/**
 * Render an HTML relay page that forwards the OIDC authorization code
 * to the Electron app's loopback server.
 *
 * The page first tries a background fetch() for the cleanest UX. If the browser
 * blocks cross-origin loopback fetches, it falls back to a top-level navigation
 * and also exposes a manual localhost link so the user can complete the flow.
 *
 * The loopback port is encoded in the `state` parameter as a prefix:
 * `{port}:{originalState}`. The relay page extracts the port, reconstructs
 * the original state, and forwards both `code` and `state` to the loopback.
 */
export function createElectronCallbackRelay() {
  return new Hono<HonoEnv>()
    .get('/', (c) => {
      const code = c.req.query('code') ?? ''
      const state = c.req.query('state') ?? ''
      const error = c.req.query('error') ?? ''
      const errorDescription = c.req.query('error_description') ?? ''

      return c.html(renderRelayPage({ code, state, error, errorDescription }))
    })
}

// Regex patterns for escaping values in HTML/JS context
const RE_BACKSLASH = /\\/g
const RE_SINGLE_QUOTE = /'/g
const RE_LT = /</g

function renderRelayPage(params: {
  code: string
  state: string
  error: string
  errorDescription: string
}): string {
  // Escape values for safe embedding in HTML/JS
  const esc = (s: string) => s.replace(RE_BACKSLASH, '\\\\').replace(RE_SINGLE_QUOTE, '\\\'').replace(RE_LT, '\\x3c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signing in — AIRI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      color: #111827;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #ffffff;
      border: 1px solid #f3f4f6;
      border-radius: 24px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03), 0 20px 25px -5px rgba(0, 0, 0, 0.05);
    }
    .logo {
      width: 48px;
      height: 48px;
      margin: 0 auto 24px;
      background: #111827;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 20px;
      letter-spacing: -0.5px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; letter-spacing: -0.025em; }
    .status { font-size: 15px; color: #6b7280; line-height: 1.5; }
    .status.error { color: #ef4444; background: #fef2f2; padding: 12px; border-radius: 8px; border: 1px solid #fecaca; margin-top: 16px; }
    .status.success { color: #059669; background: #ecfdf5; padding: 12px; border-radius: 8px; border: 1px solid #a7f3d0; margin-top: 16px; }
    .link {
      display: inline-block;
      margin-top: 24px;
      color: #4f46e5;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      transition: color 0.2s;
      word-break: break-all;
    }
    .link:hover { color: #4338ca; text-decoration: underline; }
    .link[hidden] { display: none; }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid #f3f4f6;
      border-top-color: #4f46e5;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 24px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-color-scheme: dark) {
      body { background: #030712; color: #f9fafb; }
      .card { background: #111827; border-color: #1f2937; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2); }
      .logo { background: #ffffff; color: #111827; }
      .status { color: #9ca3af; }
      .status.error { background: #7f1d1d; border-color: #991b1b; color: #fca5a5; }
      .status.success { background: #064e3b; border-color: #065f46; color: #6ee7b7; }
      .link { color: #818cf8; }
      .link:hover { color: #a5b4fc; }
      .spinner { border-color: #374151; border-top-color: #818cf8; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Ai</div>
    <h1 id="title">Signing in…</h1>
    <div class="spinner" id="spinner"></div>
    <p class="status" id="status">Completing authentication</p>
    <a id="manual-link" class="link" hidden rel="noreferrer">If AIRI does not open automatically, click here</a>
  </div>
  <script>
    (function() {
      var code = '${esc(params.code)}';
      var fullState = '${esc(params.state)}';
      var error = '${esc(params.error)}';
      var errorDesc = '${esc(params.errorDescription)}';

      var titleEl = document.getElementById('title');
      var statusEl = document.getElementById('status');
      var spinnerEl = document.getElementById('spinner');
      var manualLinkEl = document.getElementById('manual-link');

      function done(ok, msg) {
        spinnerEl.style.display = 'none';
        titleEl.textContent = ok ? 'Signed in!' : 'Sign-in failed';
        statusEl.textContent = msg;
        statusEl.className = 'status ' + (ok ? 'success' : 'error');
      }

      function revealManualLink(url, text) {
        manualLinkEl.href = url;
        manualLinkEl.textContent = text;
        manualLinkEl.hidden = false;
      }

      if (error) {
        done(false, errorDesc || error);
        return;
      }

      // State format: "{port}:{originalState}"
      var sep = fullState.indexOf(':');
      if (sep === -1) {
        done(false, 'Invalid state parameter');
        return;
      }
      var port = fullState.substring(0, sep);
      var originalState = fullState.substring(sep + 1);

      // Send the code and state to the Electron loopback server
      var url = 'http://127.0.0.1:' + port + '/callback?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(originalState);
      revealManualLink(url, 'If AIRI does not open automatically, click here');

      fetch(url)
        .then(function() {
          done(true, 'You can close this tab and return to AIRI.');
        })
        .catch(function() {
          done(false, 'Trying to open AIRI directly…');

          setTimeout(function() {
            window.location.replace(url);
          }, 150);

          setTimeout(function() {
            done(false, 'Could not reach AIRI automatically. Use the link below to continue.');
          }, 1000);
        });
    })();
  </script>
</body>
</html>`
}
