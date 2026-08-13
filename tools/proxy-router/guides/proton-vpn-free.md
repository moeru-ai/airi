# Proton VPN Free — WireGuard Configuration Export

> This guide walks you through exporting standard WireGuard `.conf` files from
> your **Proton VPN Free** account and importing them into proxy-router. You do
> **not** need a paid plan — Free servers support WireGuard.

## Prerequisites

- A Proton VPN account (free tier is fine): <https://account.protonvpn.com>
- A browser to download configuration files

## Step 1: Open the WireGuard configuration page

Go to **<https://protonvpn.com/support/wireguard-configurations>** and follow
the official instructions, or navigate directly to:

> **Settings → WireGuard → Configuration** in the Proton VPN dashboard.

Official docs: <https://protonvpn.com/support/wireguard-configurations>

## Step 2: Select servers

1. In the configuration page, you will see a list of available servers.
2. Select **multiple Free servers** — choose 3–9 servers in different countries
   for the best rotation pool. Free servers are labeled with a **free** tag.
3. For each server, download the `.conf` file. They will arrive as files like
   `protonvpn-ch-free-1.conf`.

> **Tip:** Choose servers from different regions. If one is slow or unavailable,
> proxy-router automatically rotates to the next.

## Step 3: Import into proxy-router

Copy the downloaded `.conf` files into the provider directory:

```sh
# Create the provider directory if it does not exist
mkdir -p providers/proton

# Copy all downloaded configs (adjust path to where your browser saved them)
cp ~/Downloads/protonvpn-*.conf providers/proton/

# Set safe permissions (required — configs contain private keys)
chmod 600 providers/proton/*.conf
```

Or use the setup wizard:

```sh
proxy-router setup --import-proton ~/Downloads/protonvpn-*.conf
```

The wizard validates each file and sets mode `0600` automatically.

## Step 4: Verify

```sh
ls -la providers/proton/
# Should show 0600 permissions on each .conf file

proxy-router setup --check
# Validates that at least one provider profile is loadable
```

## DNS caveat

Proton's WireGuard configs set `DNS = 10.2.0.1` (their private tunnel
resolver). This resolver intermittently blackholes DNS on macOS. proxy-router
**automatically overrides this** by routing DNS through Cloudflare `1.1.1.1`
over the same WireGuard tunnel. You do not need to edit the `.conf` files.

## Security notes

- **Never** paste private keys into chat, email, or commit them to git.
- The `.conf` files contain your WireGuard private key — treat them like
  passwords. Mode `0600` ensures only your user can read them.
- proxy-router generates `sing-box.json` with private keys inline; this file
  is also written mode `0600` and should never be committed.
- `.conf` files and generated configs are listed in `.gitignore` by default.

## Troubleshooting

- **No Free servers showing:** Ensure you are logged into a Free-tier account.
  Free servers may rotate; re-download if a specific server goes offline.
- **All profiles cooling down:** proxy-router marks used profiles for cooldown.
  Wait the cooldown period (default 60s) or add more servers to the pool.
- **`setup --check` fails:** Ensure `.conf` files are in `providers/proton/`
  and have `0600` permissions. Run `proxy-router setup` for interactive guidance.
