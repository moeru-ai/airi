// Regex patterns for escaping values in HTML/JS context
const RE_BACKSLASH = /\\/g
const RE_SINGLE_QUOTE = /'/g
const RE_LT = /</g

/**
 * Render a minimal sign-in page for the OIDC Provider flow.
 *
 * When the oidcProvider plugin redirects an unauthenticated user here,
 * they choose a social provider. After authentication, the social
 * callback redirects to callbackURL, which points back to the OIDC
 * authorize endpoint so the authorization code flow can complete.
 *
 * NOTICE: better-auth's `/api/auth/sign-in/social` is a POST endpoint
 * that expects JSON body `{ provider, callbackURL }` and returns a
 * redirect URL in JSON. We use fetch + redirect in JS, not `<a>` tags.
 */
export function renderSignInPage(baseUrl: string, callbackURL: string = '/'): string {
  const signInEndpoint = `${baseUrl}/api/auth/sign-in/social`
  // Escape callbackURL for safe embedding in a JS string literal inside HTML
  const escapedCallbackURL = callbackURL
    .replace(RE_BACKSLASH, '\\\\')
    .replace(RE_SINGLE_QUOTE, '\\\'')
    .replace(RE_LT, '\\x3c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — AIRI</title>
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
      .btn { background: #262626; border-color: #333; color: #e5e5e5; }
      .btn:hover { background: #333; }
      .footer { color: #737373; }
      .error { color: #f87171; }
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
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #737373; margin-bottom: 32px; }
    .buttons { display: flex; flex-direction: column; gap: 12px; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px 20px;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      background: #f5f5f5;
      color: #1a1a1a;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover { background: #e5e5e5; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn svg { width: 20px; height: 20px; flex-shrink: 0; }
    .footer { margin-top: 24px; font-size: 12px; color: #a3a3a3; }
    .footer a { color: inherit; text-decoration: underline; }
    .error { margin-top: 16px; font-size: 13px; color: #ef4444; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to AIRI</h1>
    <p class="subtitle">Choose a provider to continue</p>
    <div class="buttons">
      <button class="btn" onclick="signIn('google', this)">
        <svg viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Google
      </button>
      <button class="btn" onclick="signIn('github', this)">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
        GitHub
      </button>
    </div>
    <p class="error" id="error"></p>
    <p class="footer">
      By continuing, you agree to our
      <a href="https://airi.moeru.ai/docs/en/about/terms">Terms</a> and
      <a href="https://airi.moeru.ai/docs/en/about/privacy">Privacy Policy</a>.
    </p>
  </div>
  <script>
    async function signIn(provider, btn) {
      var errorEl = document.getElementById('error');
      errorEl.style.display = 'none';
      btn.disabled = true;

      try {
        var res = await fetch('${signInEndpoint}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: provider,
            callbackURL: '${escapedCallbackURL}'
          }),
          credentials: 'include',
          redirect: 'manual'
        });

        // better-auth returns { url, redirect } for social sign-in
        if (res.type === 'opaqueredirect' || res.status === 302) {
          window.location.href = res.headers.get('location') || '/';
          return;
        }

        var data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else if (data.error) {
          throw new Error(data.error.message || data.error);
        } else {
          throw new Error('Unexpected response');
        }
      } catch (e) {
        errorEl.textContent = e.message || 'Sign in failed';
        errorEl.style.display = 'block';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`
}
