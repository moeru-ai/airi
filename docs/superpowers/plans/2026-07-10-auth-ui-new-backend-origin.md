# Auth UI New Backend Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production Auth UI honor OIDC redirects from `https://airi-server-next.up.railway.app` without broadening trust to arbitrary Railway origins.

**Architecture:** Keep the existing exact-origin trust model in `server-auth-context.ts`. Add one exact production origin and prove the redirect context resolves to it while existing untrusted-origin tests remain green.

**Tech Stack:** TypeScript, Vue/Vite, Vitest, pnpm, GitHub Actions, Cloudflare Pages

---

### Task 1: Trust the new Go backend origin

**Files:**
- Modify: `apps/ui-server-auth/src/modules/server-auth-context.test.ts:18`
- Modify: `apps/ui-server-auth/src/modules/server-auth-context.ts:17`

- [ ] **Step 1: Write the failing regression test**

Add this case after the existing trusted server-dev case:

```ts
it('uses the trusted new Go backend origin carried by standalone server redirects', () => {
  const currentUrl = 'https://auth.airi.build/ui/sign-in?api_server_url=https%3A%2F%2Fairi-server-next.up.railway.app&client_id=airi-stage-pocket'

  expect(resolveStandaloneServerAuthContext(
    currentUrl,
    'https://api.airi.build',
  )).toEqual({
    apiServerUrl: 'https://airi-server-next.up.railway.app',
    currentUrl,
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm -F @proj-airi/ui-server-auth exec vitest run src/modules/server-auth-context.test.ts
```

Expected: one assertion fails because `resolveStandaloneServerAuthContext` returns `null` for the new backend origin.

- [ ] **Step 3: Add the exact trusted production origin**

Update the allowlist to:

```ts
const TRUSTED_STANDALONE_API_SERVER_ORIGINS = [
  'https://api.airi.build',
  'https://airi-server-next.up.railway.app',
  'https://airi-server-dev.up.railway.app',
]
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm -F @proj-airi/ui-server-auth exec vitest run src/modules/server-auth-context.test.ts
```

Expected: the file passes with six tests, including the existing crafted-origin rejection.

- [ ] **Step 5: Commit the behavior change**

```bash
git add apps/ui-server-auth/src/modules/server-auth-context.ts apps/ui-server-auth/src/modules/server-auth-context.test.ts
git commit -m "fix(ui-server-auth): trust new Go backend origin"
```

### Task 2: Verify the Auth UI package

**Files:**
- Verify: `apps/ui-server-auth/**`

- [ ] **Step 1: Run the complete Auth UI test suite**

```bash
pnpm -F @proj-airi/ui-server-auth exec vitest run
```

Expected: all Auth UI test files pass.

- [ ] **Step 2: Run type checking**

```bash
pnpm -F @proj-airi/ui-server-auth typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

```bash
VITE_SERVER_URL=https://api.airi.build pnpm -F @proj-airi/ui-server-auth build
```

Expected: Vite exits with code 0 and writes `apps/ui-server-auth/dist`.

- [ ] **Step 4: Inspect the built bundle**

```bash
rg -l 'airi-server-next\.up\.railway\.app' apps/ui-server-auth/dist/assets/*.js
```

Expected: at least one emitted JavaScript asset contains the exact new backend origin.

### Task 3: Publish, deploy, and validate production

**Files:**
- Verify: `.github/workflows/deploy-cloudflare-auth-ui.yml`

- [ ] **Step 1: Push the feature branch and open a pull request**

```bash
git push -u origin codex/auth-ui-new-backend
PR_URL="$(gh pr create --repo moeru-ai/airi --base main --head Neko-233:codex/auth-ui-new-backend --title "fix(ui-server-auth): trust new Go backend origin" --body $'## Summary\n- trust the new Railway Go backend in the standalone Auth UI\n- preserve exact-origin validation for untrusted redirects\n\n## Test plan\n- focused and complete Auth UI Vitest suites\n- Auth UI typecheck and production build\n- emitted bundle origin check')"
printf '%s' "$PR_URL" > /tmp/auth-ui-new-backend-pr-url
printf '%s\n' "$PR_URL"
```

Expected: GitHub returns a pull request URL targeting `moeru-ai/airi:main`.

- [ ] **Step 2: Merge after required checks pass**

```bash
PR_URL="$(cat /tmp/auth-ui-new-backend-pr-url)"
gh pr checks "$PR_URL" --watch
gh pr merge "$PR_URL" --squash --delete-branch
```

Expected: the pull request is merged into `main`.

- [ ] **Step 3: Wait for the production Auth UI deployment**

```bash
RUN_ID="$(gh run list --repo moeru-ai/airi --workflow deploy-cloudflare-auth-ui.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch --repo moeru-ai/airi "$RUN_ID"
```

Expected: `Cloudflare Pages (Auth UI)` completes successfully for the merge commit.

- [ ] **Step 4: Validate the deployed bundle and login boundary**

Fetch the current Auth UI HTML, resolve its hashed JavaScript assets, and verify one asset contains the exact new backend origin:

```bash
LIVE_DIR="$(mktemp -d /tmp/airi-auth-ui-live.XXXXXX)"
printf '%s' "$LIVE_DIR" > /tmp/airi-auth-ui-live-dir
mkdir -p "$LIVE_DIR/assets"
curl -fsSL https://auth.airi.build/ui/sign-in -o "$LIVE_DIR/index.html"
rg -o 'src="/assets/[^"]+\.js' "$LIVE_DIR/index.html" | sed 's/^src="//' | while read -r asset; do
  curl -fsSL "https://auth.airi.build${asset}" -o "$LIVE_DIR/assets/$(basename "$asset")"
done
rg -l 'https://airi-server-next\.up\.railway\.app' "$LIVE_DIR"/assets/*.js
```

Repeat the new backend OIDC authorize redirect and confirm the final Auth UI location carries the new `api_server_url`:

```bash
LIVE_DIR="$(cat /tmp/airi-auth-ui-live-dir)"
curl -sS -L -o /dev/null -D "$LIVE_DIR/redirects.headers" -G 'https://airi-server-next.up.railway.app/api/auth/oauth2/authorize' \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=airi-stage-pocket' \
  --data-urlencode 'redirect_uri=ai.moeru.airi-pocket://links/auth/callback' \
  --data-urlencode 'scope=openid profile email offline_access' \
  --data-urlencode 'state=production-validation' \
  --data-urlencode 'code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode 'resource=https://airi-server-next.up.railway.app'
rg -n 'location: https://auth\.airi\.build/.*api_server_url=https%3A%2F%2Fairi-server-next\.up\.railway\.app' -i "$LIVE_DIR/redirects.headers"
```

Send an OPTIONS preflight and a diagnostic POST to:

```text
https://airi-server-next.up.railway.app/api/auth/check-email
```

Run:

```bash
LIVE_DIR="$(cat /tmp/airi-auth-ui-live-dir)"
curl -sS -o /dev/null -D "$LIVE_DIR/preflight.headers" \
  -X OPTIONS 'https://airi-server-next.up.railway.app/api/auth/check-email' \
  -H 'Origin: https://auth.airi.build' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
rg -n 'HTTP/.* 204|access-control-allow-origin: https://auth\.airi\.build' -i "$LIVE_DIR/preflight.headers"

curl -sS -o "$LIVE_DIR/check-email.json" -w '%{http_code}\n' \
  -X POST 'https://airi-server-next.up.railway.app/api/auth/check-email' \
  -H 'Origin: https://auth.airi.build' \
  -H 'Content-Type: application/json' \
  --data '{"email":"codex-production-validation@example.com"}'
jq -e '.exists == false and .hasPassword == false' "$LIVE_DIR/check-email.json"
```

Expected: preflight returns `204` with `access-control-allow-origin: https://auth.airi.build`, and the diagnostic lookup returns `200` with a valid response body.
