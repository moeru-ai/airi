# Cloudflare WARP — WireGuard Profile for proxy-router

> Cloudflare WARP can be used as a WireGuard provider for proxy-router via the
> official WARP client **or** a standalone WireGuard `.conf` profile generated
> with `wgcf`. This guide covers both approaches. **WARP is optional** —
> proxy-router does not need both Proton and WARP enabled simultaneously.

## Option A: Official WARP client (not recommended for proxy-router)

The official Cloudflare WARP client runs as a system service and manages its
own WireGuard tunnel. proxy-router cannot rotate or manage its profiles
directly. Use this only if you want WARP for general system-wide traffic
outside of proxy-router's routing.

Docs: <https://developers.cloudflare.com/warp-client/get-started/>

## Option B: wgcf profile (recommended)

`wgcf` generates a standard WireGuard `.conf` from your WARP account. This is
the approach proxy-router supports — you get a normal `.conf` file that
proxy-router can manage alongside Proton profiles.

### Step 1: Install wgcf

```sh
# macOS (Homebrew)
brew install wgcf

# Linux (manual download)
# See https://github.com/ViRb3/wgcf/releases for your platform
```

Official docs: <https://github.com/ViRb3/wgcf>

### Step 2: Generate account and profile

```sh
# Create a WARP account and register your device
wgcf register
# This creates wgcf-account.toml with your account/license details

# Generate the WireGuard profile
wgcf generate
# This creates wgcf-profile.conf
```

> **Note:** The generated profile uses Cloudflare's DNS (`1.1.1.1`), which
> works well with proxy-router.

### Step 3: Import into proxy-router

```sh
# Create the provider directory
mkdir -p providers/cloudflare

# Copy the generated profile
cp wgcf-profile.conf providers/cloudflare/warp.conf

# Set safe permissions
chmod 600 providers/cloudflare/*.conf
```

Or use the setup wizard:

```sh
proxy-router setup --import-warp wgcf-profile.conf
```

### Step 4: Verify

```sh
ls -la providers/cloudflare/
# Should show 0600 permissions

proxy-router setup --check
```

## Multiple WARP profiles

For rotation, you can register multiple devices with wgcf (each `wgcf register`
creates a new device) and import each as a separate `.conf`:

```sh
# First device
wgcf register
wgcf generate
cp wgcf-profile.conf providers/cloudflare/warp1.conf

# Second device (new registration)
rm wgcf-account.toml  # reset to create fresh registration
wgcf register
wgcf generate
cp wgcf-profile.conf providers/cloudflare/warp2.conf

chmod 600 providers/cloudflare/*.conf
```

## When to use WARP

- **Roblox routing:** WARP is the validated provider for Roblox domains.
  The `roblox` route in `router.example.json` targets `cloudflare` by default.
- **As a fallback:** If all Proton profiles are cooling down, WARP provides
  an alternate exit path.
- **Standalone:** You can use WARP-only without Proton. Just import WARP
  profiles and create routes targeting the `cloudflare` provider.

## Security notes

- **Never** paste private keys into chat, email, or commit them to git.
- `.conf` files contain your WireGuard private key — treat them like passwords.
- proxy-router writes `sing-box.json` with private keys inline at mode `0600`.
- Keep `wgcf-account.toml` private — it contains your WARP license key.

## Troubleshooting

- **`wgcf register` fails:** Check your network connection. Cloudflare may
  rate-limit registrations from the same IP.
- **Profile import rejected:** Ensure the `.conf` file has a `[Interface]`
  and `[Peer]` section. Run `proxy-router setup --check` for details.
- **`setup --check` fails:** Verify files are in `providers/cloudflare/` with
  `0600` permissions and contain valid WireGuard configuration.
