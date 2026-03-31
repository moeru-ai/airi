import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

/**
 * Render an HTML relay page that forwards the OIDC authorization code
 * to the Electron app's loopback server via a JS fetch() call.
 *
 * This avoids redirecting the browser to http://127.0.0.1:{port}/callback,
 * which shows an ugly URL and can fail if the browser blocks loopback navigations.
 * Instead, the browser stays on the server-served page and sends a background
 * GET request to the loopback.
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      color: #1a1a1a;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0a; color: #e5e5e5; }
      .card { background: #171717; border-color: #262626; }
      .status.error { color: #f87171; }
    }
    .card {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 16px;
      padding: 40px 32px;
      width: 100%;
      max-width: 380px;
      text-align: center;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 12px; }
    .status { font-size: 14px; color: #737373; }
    .status.error { color: #ef4444; }
    .status.success { color: #22c55e; }
    .spinner {
      width: 24px; height: 24px;
      border: 3px solid #e5e5e5;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 16px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Signing in…</h1>
    <div class="spinner" id="spinner"></div>
    <p class="status" id="status">Completing authentication</p>
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

      function done(ok, msg) {
        spinnerEl.style.display = 'none';
        titleEl.textContent = ok ? 'Signed in!' : 'Sign-in failed';
        statusEl.textContent = msg;
        statusEl.className = 'status ' + (ok ? 'success' : 'error');
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

      fetch(url)
        .then(function() {
          done(true, 'You can close this tab and return to AIRI.');
        })
        .catch(function() {
          done(false, 'Could not reach the app. Please try again.');
        });
    })();
  </script>
</body>
</html>`
}
