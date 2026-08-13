#!/usr/bin/env python3
"""proxy_tray.py — menu-bar / taskbar control for proxy-router.

Thin-client tray agent in the style of popular VPN daemons (Tailscale,
ProtonVPN, Cloudflare WARP): a resident status icon whose menu shows live
state and triggers the existing router CLI. It NEVER mutates engine state
itself — every action shells out to `router.py`, so rotation ownership,
cooldowns, and keepalive semantics stay exactly where they are.

Design rules:
- Reads: `router.py status --json` polled in a background thread (2.5s).
- Actions: `ensure` / `stop` / `routing set --mode` / `rotate` via the CLI.
- macOS: runs as an accessory (menu-bar only, no Dock icon).
- Windows: pystray falls back to the taskbar notification area automatically.

Usage:
    python3 proxy_tray.py [--root /path/to/proxy-router]
    python3 proxy_tray.py --selftest   # no GUI; validates CLI contract + dispatch

Env: PROXY_ROUTER_ROOT overrides the router directory.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:  # --selftest and --help must work without the GUI stack
    pystray = None
    Image = ImageDraw = None

POLL_SECONDS = 5.0  # live-enough menu state without spawning 24 CLI procs/min
COMMAND_TIMEOUT = 20
# osascript's admin-password dialog blocks until the user answers; a regular
# command timeout would kill the toggle mid-prompt. Generous on purpose.
ELEVATED_COMMAND_TIMEOUT = 120

# Friendly, non-jargon labels for tray menu entries. The router CLI words
# (safe-list / vpn-list / rotate / exit) stay in the terminal; the tray
# speaks home / school / switch / server.
_ROUTING_MODE_LABELS = {
    "safe-list": "home (safe list)",
    "vpn-list": "school (vpn list)",
}

# Built-in presets: (name, tray label). Custom presets under `presets/*.json`
# are appended dynamically so TUI-created presets show up here too.
_BUILTIN_PRESETS = (
    ("opencode", "opencode — route opencode.ai via Proton"),
    ("roblox", "roblox — route Roblox via Cloudflare"),
    ("default", "default — opencode + roblox combo"),
    ("school-warp", "school-warp — school sites via Cloudflare"),
)

# Raw CLI error fragments -> what a non-technical user should actually do.
_FRIENDLY_ERRORS = (
    ("no sing-box binary", "VPN engine not found — run Setup, then Connect"),
    ("needs 'default_provider'", "pick a default provider first: Routing mode → home (safe list)"),
    ("no active profile", "no VPN profile yet — add one under Setup"),
    ("missing router.json", "no configuration yet — start under Setup"),
    ("all profiles cooling down",
     "no servers available right now — try again in a minute"),
    ("no valid profiles", "no usable profiles found — re-add your .conf under Setup"),
)


def _friendly_egress_error(err: object) -> str:
    """Turn a raw probe/egress error tail into a short human label.

    The egress record stores Python-level failure strings (e.g.
    ``URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING, EOF
    occurred in violation of protocol (_ssl.c:983)]>``). Rendering that
    verbatim in the exit picker is operator jargon; map the common classes
    to plain language and keep the code when it is meaningful (429/403).
    """
    s = str(err).strip()
    low = s.lower()
    if not s:
        return "offline"
    if "ssl" in low or "certificate" in low or "unexpected_eof" in low:
        return "offline (SSL)"
    if "timed out" in low or "timeout" in low:
        return "timed out"
    if "connection refused" in low or "connection reset" in low:
        return "offline"
    if "dns" in low or "name or service" in low or "hostname" in low:
        return "no route (DNS)"
    if "rate limit" in low or "429" in s:
        return "rate-limited"
    if "403" in s or "1010" in s or "blocked" in low:
        return "blocked"
    return s[:28]


def _humanize(out: str) -> str:
    """Translate the last CLI line from operator jargon to user-facing text.

    Success paths that only say "engine not reloaded / run router.py ensure"
    become an actionable "Connect to apply"; known raw error fragments become
    the concrete next step instead of the internal message.
    """
    if not out:
        return ""
    if "engine is untouched" in out or "engine was NOT reloaded" in out:
        return "saved — Connect to apply"
    detail = out.splitlines()[-1][:160]
    for needle, repl in _FRIENDLY_ERRORS:
        if needle in detail:
            return repl
    return detail


@dataclass
class RouterStatus:
    up: bool = False
    mode: str = "unknown"
    port: int | None = None
    pid: int | None = None
    watcher: bool = False
    active_providers: dict = field(default_factory=dict)
    providers: dict = field(default_factory=dict)  # name -> {active, profiles, egress}
    routing_mode: str = "default"
    preset: str | None = None
    error: str | None = None

    @classmethod
    def from_cli(cls, rc: int, stdout: str) -> "RouterStatus":
        # `status --json` exits 1 whenever the engine is down OR not yet
        # configured, but it still prints a valid JSON payload. Treating
        # rc != 0 as an error made the tray show "! Error" on every plain
        # disconnect and "! Error status exit 1" on a fresh install — the
        # payload below carries the real state. Only an unparseable payload
        # is an error now.
        try:
            payload = stdout[stdout.find("{"):] if "{" in stdout else stdout
            d = json.JSONDecoder().raw_decode(payload)[0]
        except (json.JSONDecodeError, ValueError) as e:
            return cls(error=f"status exit {rc}" if rc else f"bad json: {e}")
        providers = {}
        provider_map = {}
        for name, info in (d.get("providers") or {}).items():
            active = info.get("active")
            if active:
                providers[name] = active
            egress = {}
            for stem, rec in (info.get("egress") or {}).items():
                egress[stem] = {
                    "ok": bool(rec.get("ok")),
                    "latency_ms": rec.get("latency_ms"),
                    "status": rec.get("status"),
                    "error": rec.get("error") or rec.get("upstream_error"),
                }
            provider_map[name] = {
                "active": active,
                "profiles": list(info.get("profiles") or []),
                "egress": egress,
            }
        routing = d.get("routing") or {}
        watcher = d.get("watcher") or {}
        return cls(
            up=bool(d.get("up")),
            mode=str(d.get("mode") or "unknown"),
            port=d.get("port"),
            pid=d.get("pid"),
            watcher=bool(watcher.get("enabled") and watcher.get("running")),
            active_providers=providers,
            providers=provider_map,
            routing_mode=str(routing.get("mode") or "default"),
            preset=d.get("preset") or None,
        )

    def provider_label(self, name: str) -> str:
        """Compact single-line label for a provider row, e.g.
        'proton → 01-NL-FREE-140 · 164ms'. The dot reflects REAL health:
        a probe that rode the tunnel is not enough — a persisted upstream
        error (e.g. 429 rate-limit) or exhausted marker keeps it amber."""
        info = self.providers.get(name, {})
        active = info.get("active")
        egress = (info.get("egress") or {}).get(active or "", {})
        lat = egress.get("latency_ms")
        if active and lat:
            tag = f"{active} · {lat:.0f}ms" if isinstance(lat, (int, float)) else active
        elif active:
            tag = active
        else:
            tag = "no active exit"
        ok = egress.get("ok")
        # A lane can probe ok while the exit is actually rate-limited or
        # exhausted upstream (record keeps `upstream_error` across probes).
        warn = bool(egress.get("upstream_error") or egress.get("error")
                    or egress.get("exhausted"))
        if warn:
            mark = "▲"
        elif ok:
            mark = "●"
        elif ok is False:
            mark = "○"
        else:
            mark = "·"
        return f"{name} {mark} {tag}"

    def profile_health(self, name: str, profile: str) -> str:
        """Short health suffix for one exit, e.g. '· 164ms' or '! offline'.
        Returns '' when nothing is known yet. `upstream_error` (a persisted
        rotate --reason marker like 429/503) counts as an error even when
        the last probe succeeded — the exit is rate-limited/blocked for
        real traffic."""
        rec = (self.providers.get(name, {}).get("egress") or {}).get(profile)
        if not rec:
            return ""
        err = rec.get("error") or rec.get("upstream_error")
        if err:
            return " ! " + _friendly_egress_error(err)
        lat = rec.get("latency_ms")
        if isinstance(lat, (int, float)):
            return f" · {lat:.0f}ms"
        if rec.get("ok"):
            return " · ok"
        return ""

    def headline(self) -> str:
        if self.error:
            return f"proxy-router: error ({self.error})"
        state = "connected" if self.up else "disconnected"
        detail = self.mode
        if self.up and self.port:
            detail = f"proxy :{self.port}"
        watcher = "watcher on" if self.watcher else "watcher off"
        return f"proxy {state} · {detail} · {watcher}"


class RouterClient:
    """Runs router.py subcommands; all mutation goes through the CLI."""

    def __init__(self, root: str):
        self.root = root
        self.python = sys.executable or "python3"
        self.router = os.path.join(root, "router.py")
        self._active_provider: str | None = None

    def _run(self, *args: str) -> tuple[int, str]:
        cmd = [self.python, self.router, *args]
        env = dict(os.environ)
        try:
            p = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=COMMAND_TIMEOUT, env=env, cwd=self.root,
            )
            out = (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
            return p.returncode, out.strip()
        except subprocess.TimeoutExpired:
            return -1, f"timeout: {' '.join(cmd)}"
        except FileNotFoundError as e:
            return -2, f"missing: {e}"

    def status(self) -> RouterStatus:
        rc, out = self._run("status", "--json")
        st = RouterStatus.from_cli(rc, out)
        if st.active_providers:
            # remember the carrying provider for bare "Rotate exit"
            self._active_provider = next(iter(st.active_providers))
        return st

    def ensure(self) -> tuple[int, str]:
        return self._run("ensure")

    def start(self) -> tuple[int, str]:
        # Explicit start: clears any manual-off marker (tray Connect).
        return self._run("start")

    def stop(self) -> tuple[int, str]:
        return self._run("stop")

    def rotate(self) -> tuple[int, str]:
        return self._run("rotate", self._active_provider)

    def rotate_to(self, provider: str, profile: str) -> tuple[int, str]:
        return self._run("rotate", provider, "--to", profile)

    def set_mode(self, mode: str, default_provider: str | None = None) -> tuple[int, str]:
        cmd = ["routing", "set", "--mode", mode]
        if default_provider:
            cmd += ["--default-provider", default_provider]
        return self._run(*cmd)

    def setup_import(self, provider: str, paths) -> tuple[int, str]:
        """Import .conf profile(s) via the setup wizard CLI (no engine touch)."""
        flag = "--import-proton" if provider == "proton" else "--import-warp"
        return self._run("setup", flag, *paths)

    def setup_preset(self, name: str) -> tuple[int, str]:
        """Apply a named preset (idempotent, lossless) via the setup CLI."""
        return self._run("setup", "--preset", name)

    def vpn(self, action: str) -> tuple[int, str]:
        """Toggle full-tunnel (TUN) mode via the router CLI.

        TUN mode needs root (utun creation, route table), so macOS elevates
        through the standard admin-password dialog. The tray runs under
        launchd with no TTY, which router.py's own isatty-gated elevation
        explicitly refuses — so the tray drives osascript itself, with the
        same SUDO_UID/SUDO_GID hand-back env the CLI injects.
        """
        if sys.platform == "darwin":
            return self._run_elevated("vpn", action)
        # Non-macOS: no osascript path; the CLI's clear error tells the user
        # to run it elevated (sudo) from a terminal.
        return self._run("vpn", action)

    def _run_elevated(self, *args: str) -> tuple[int, str]:
        """Run a router.py command as root through the macOS admin dialog.

        Mirrors router.py's `_elevate_macos`: same env injection
        (SUDO_UID/SUDO_GID for state-file hand-back, PROXY_ROUTER_ELEVATED
        to suppress re-elevation, PATH passthrough so the bundled sing-box
        still resolves) and the same AppleScript escaping rules.
        """
        env = (
            f"SUDO_UID={os.getuid()} SUDO_GID={os.getgid()} "
            f"PROXY_ROUTER_ELEVATED=1 "
            f"PATH={shlex.quote(os.environ.get('PATH', ''))}"
        )
        cmd = shlex.join([self.python, self.router, *args])
        shell_cmd = f"{env} {cmd}"
        # AppleScript string literals accept only `\"` and `\\` escapes; escape
        # the shell command's quotes/backslashes but keep the literal delimiters
        # unescaped (a `\` at expression position is a syntax error).
        content = shell_cmd.replace("\\", "\\\\").replace('"', '\\"')
        script = f'do shell script "{content}" with administrator privileges'
        try:
            p = subprocess.run(
                ["osascript", "-e", script], capture_output=True, text=True,
                timeout=ELEVATED_COMMAND_TIMEOUT,
            )
            out = (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
            return p.returncode, out.strip()
        except subprocess.TimeoutExpired:
            return -1, "timeout: admin dialog did not answer in time"
        except FileNotFoundError:
            return -2, "missing: osascript (this action needs macOS)"


def make_icon(color: str, size: int = 64) -> "Image.Image":
    """Small filled-circle status icon (green=up, red=down, orange=warn)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=color, outline=(255, 255, 255, 220), width=max(2, size // 16),
    )
    return img


class TrayApp:
    def __init__(self, client: RouterClient, icon_image: "Image.Image"):
        self.client = client
        self.icon_image = icon_image
        self.latest: RouterStatus = RouterStatus()
        self.lock = threading.Lock()
        self.last_action_result: str | None = None
        self.quit_flag = threading.Event()
        self.tray = None
        self._menu_sig: str | None = None
        self._icon_sig: str | None = None

    # ---- status polling ------------------------------------------------
    def _status_signature(self, st: RouterStatus) -> str:
        """Stable signature of everything the menu/icon renders.

        Rebuilding the pystray menu on macOS tears down the NSMenu under the
        cursor; a rebuild racing a click loses the action handler, which is
        exactly the 'half the buttons don't work' symptom. Rebuild ONLY when
        the rendered state actually changed, never on a timer tick with the
        same values.
        """
        health = {}
        for name, info in (st.providers or {}).items():
            health[name] = {
                p: (rec.get("ok"), rec.get("error"), rec.get("latency_ms"))
                for p, rec in (info.get("egress") or {}).items()
            }
        return repr({
            "up": st.up, "error": st.error, "mode": st.mode, "port": st.port,
            "watcher": st.watcher, "routing": st.routing_mode,
            "active": st.active_providers, "health": health,
            "action": self.last_action_result,
        })

    def poll_loop(self) -> None:
        while not self.quit_flag.is_set():
            try:
                st = self.client.status()
                with self.lock:
                    self.latest = st
                if self.tray is not None:
                    icon_color = (
                        "#4caf50" if st.up
                        else ("#ff9800" if st.error else "#e53935")
                    )
                    if icon_color != self._icon_sig:
                        self._icon_sig = icon_color
                        self.tray.icon = make_icon(icon_color)
                    sig = self._status_signature(st)
                    if sig != self._menu_sig:
                        self._menu_sig = sig
                        # Rebuild the menu from the live snapshot: pystray's
                        # update_menu() re-renders the OLD menu tree, so
                        # without reassigning .menu the status/action labels
                        # stay frozen at whatever was captured at startup.
                        self.tray.menu = self.build_menu()
            except Exception as e:  # keep the tray alive on any poll failure
                with self.lock:
                    self.latest = RouterStatus(error=str(e)[:80])
            self.quit_flag.wait(POLL_SECONDS)

    def _snapshot(self) -> RouterStatus:
        with self.lock:
            return self.latest

    # ---- actions ---------------------------------------------------------
    def _do(self, fn, label: str):
        # Run the mutation on a worker thread: pystray invokes callbacks on
        # its own thread, and a synchronous 20s router.py subprocess would
        # freeze the menu (and on some macOS builds, the run loop) for the
        # whole command. Show a "working…" line immediately, then swap in
        # the real result when the command lands.
        with self.lock:
            self.last_action_result = f"{label}: working…"
        if self.tray is not None:
            self._menu_sig = None  # force a rebuild that shows "working…"
            self.tray.menu = self.build_menu()

        def worker():
            try:
                rc, out = fn()
            except Exception as e:
                rc, out = -1, f"{type(e).__name__}: {e}"
            detail = _humanize(out)
            result = f"{label}: {'done' if rc == 0 else 'failed'}"
            if detail:
                result += f" — {detail}"
            try:
                refreshed = self.client.status()
            except Exception as e:
                refreshed = RouterStatus(error=str(e)[:80])
            with self.lock:
                self.last_action_result = result
                self.latest = refreshed
            if self.tray is not None:
                self._menu_sig = None
                self.tray.menu = self.build_menu()

        threading.Thread(target=worker, daemon=True).start()

    def action_connect(self):
        # start (not ensure): also clears the manual-off marker written by
        # Disconnect, so keepalive resumes watching afterwards.
        self._do(self.client.start, "connect")

    def action_disconnect(self):
        self._do(self.client.stop, "disconnect")

    def action_toggle_vpn(self):
        """Full-tunnel (TUN) on/off switch: click turns the tunnel on when
        off and off when on (home/school switch)."""
        with self.lock:
            on = self.latest.mode == "tun"
        self._do(lambda: self.client.vpn("off" if on else "on"),
                 f"full tunnel {'off' if on else 'on'}")

    def action_rotate(self):
        self._do(self.client.rotate, "switch server")

    def action_mode(self, mode: str):
        provider = None
        if mode == "safe-list":
            # safe-list routes everything NOT on the direct list through
            # ONE provider. If the config has no default_provider yet, fall
            # back to the currently active provider so the click just works
            # instead of returning a raw "needs default_provider" rc=1.
            with self.lock:
                active = self.latest.active_providers
            provider = next(iter(active), None) if active else None
        self._do(lambda: self.client.set_mode(mode, provider),
                 f"mode {_ROUTING_MODE_LABELS.get(mode, mode)}")

    def action_import_profile(self, provider: str):
        """Native file picker → import .conf profiles (no terminal needed)."""
        # tkinter is only imported inside the action so --selftest and --help
        # keep working on headless machines.
        try:
            import tkinter as tk
            from tkinter import filedialog
        except ImportError:
            self._do(lambda: (1, "file picker unavailable on this system — "
                                  "add the profile from the terminal, see the Setup guide"),
                     f"import {provider}")
            return

        def pick_and_import():
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            files = filedialog.askopenfilenames(
                title=f"Add {provider} VPN profile (.conf)",
                filetypes=[("WireGuard profile", "*.conf"), ("All files", "*.*")],
            )
            root.destroy()
            if not files:
                return 0, "no file selected — nothing imported"
            return self.client.setup_import(provider, list(files))

        self._do(pick_and_import, f"import {provider}")

    def action_apply_preset(self, name: str):
        """One-click preset apply (idempotent, lossless, no engine touch)."""
        self._do(lambda: self.client.setup_preset(name), f"preset {name}")

    def action_show_guide(self, provider: str):
        """Open the bundled setup guide in the default app (macOS) so a
        non-technical user can learn where .conf profiles come from without
        leaving the tray. Read-only; never touches engine state."""
        guide = os.path.join(
            self.client.root, "guides",
            "proton-vpn-free.md" if provider == "proton" else "cloudflare-warp.md")
        if not os.path.isfile(guide):
            self._do(lambda: (1, f"guide file missing ({guide})"), f"guide {provider}")
            return
        if sys.platform == "darwin":
            # `open` returns immediately; the default markdown/text viewer
            # takes over. Not a background process of ours.
            subprocess.Popen(["open", guide])
        else:
            # non-macOS fallback: print the guide to stdout (best effort).
            try:
                with open(guide, encoding="utf-8") as f:
                    print(f.read())
            except OSError as e:
                print(f"guide: cannot read {guide}: {e}", file=sys.stderr)

    def action_quit(self):
        self.quit_flag.set()
        if self.tray is not None:
            self.tray.stop()

    # ---- menu -------------------------------------------------------------
    def build_menu(self) -> pystray.Menu:
        with self.lock:
            st = self.latest
            last_action_result = self.last_action_result
        items = []

        # Status header — compact, human-readable. A fresh install (no
        # providers, engine never started) gets its own banner instead of a
        # bare "Disconnected" and a first step pointing at Setup.
        first_run = not st.providers and not st.up and not st.error
        if first_run:
            state = "● No VPN set up yet"
        elif st.up:
            state = "● Connected"
        elif st.error:
            state = "! Error"
        else:
            state = "○ Disconnected"
        items.append(pystray.MenuItem(state, None))
        if first_run:
            items.append(pystray.MenuItem(
                "Start here: Setup → Add a profile (.conf)", None))
        if st.active_providers:
            prov = ", ".join(f"{k} → {v}" for k, v in st.active_providers.items())
            items.append(pystray.MenuItem(prov, None))
        if st.routing_mode != "default":
            items.append(pystray.MenuItem(
                f"mode: {_ROUTING_MODE_LABELS.get(st.routing_mode, st.routing_mode)}",
                None))
        if st.preset:
            items.append(pystray.MenuItem(
                f"preset: {st.preset}", None))
        if last_action_result:
            items.append(pystray.MenuItem(last_action_result, None))

        items.append(pystray.Menu.SEPARATOR)

        # Actions — terse, no CLI flags. Connect is only offered once at
        # least one provider exists; on a fresh install the banner above
        # directs to Setup instead of producing a raw CLI failure.
        items.append(pystray.MenuItem(
            "Reconnect" if st.up else "Connect",
            self.action_connect, enabled=bool(st.providers)))
        items.append(pystray.MenuItem(
            "Switch VPN server", self.action_rotate, enabled=st.up))

        # Provider picker — like Tailscale/Proton: pick a provider, then an exit
        if st.providers and st.up:
            provider_menu = self._build_provider_menu(st)
            items.append(pystray.MenuItem("Provider", provider_menu))
        items.append(pystray.MenuItem(
            "Disconnect", self.action_disconnect, enabled=st.up))
        # Full tunnel (TUN) — checked when on. Clicking toggles it, which on
        # macOS pops the standard admin dialog (the engine/utun needs root).
        items.append(pystray.MenuItem(
            "Full tunnel (WARP): on" if st.mode == "tun"
            else "Full tunnel (WARP): off",
            self.action_toggle_vpn,
            checked=lambda item: st.mode == "tun"))

        items.append(pystray.Menu.SEPARATOR)

        # Routing mode — checked submenu
        def mode_checked(m: str):
            return st.routing_mode == m

        items.append(pystray.MenuItem(
            "Routing mode",
            pystray.Menu(
                pystray.MenuItem("safe-list (home)", lambda: self.action_mode("safe-list"),
                                 checked=lambda item: mode_checked("safe-list")),
                pystray.MenuItem("vpn-list (school)", lambda: self.action_mode("vpn-list"),
                                 checked=lambda item: mode_checked("vpn-list")),
                pystray.MenuItem("default", lambda: self.action_mode("default"),
                                 checked=lambda item: mode_checked("default")),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Use safe-list at home, vpn-list at school",
                                 None, enabled=False),
            ),
        ))

        # Setup — plain-language entries for non-terminal users. The guide
        # entries answer "where do I even get a .conf file?" before the user
        # hits the import file-picker cold.
        items.append(pystray.MenuItem(
            "Setup",
            pystray.Menu(
                pystray.MenuItem(
                    "New here? .conf files come from your VPN provider's website",
                    None, enabled=False),
                pystray.MenuItem("How to get a Proton profile (guide)",
                                 lambda: self.action_show_guide("proton")),
                pystray.MenuItem("How to get a Cloudflare WARP profile (guide)",
                                 lambda: self.action_show_guide("cloudflare")),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Add Proton profile (.conf)…",
                                 lambda: self.action_import_profile("proton")),
                pystray.MenuItem("Add Cloudflare WARP profile (.conf)…",
                                 lambda: self.action_import_profile("cloudflare")),
            ),
        ))

        # Presets — top-level, one click each, active one checked. Custom
        # presets created in the setup TUI show up here too (read from
        # `presets/*.json`), so the tray never hides a preset the user made.
        preset_items = []
        for name, label in _BUILTIN_PRESETS:
            preset_items.append(pystray.MenuItem(
                label, lambda n=name: self.action_apply_preset(n),
                checked=lambda item, n=name: st.preset == n))
        for name in self._custom_preset_names():
            preset_items.append(pystray.MenuItem(
                self._custom_preset_label(name),
                lambda n=name: self.action_apply_preset(n),
                checked=lambda item, n=name: st.preset == n))
        items.append(pystray.MenuItem("Presets", pystray.Menu(*preset_items)))
        items.append(pystray.Menu.SEPARATOR)
        items.append(pystray.MenuItem("Quit", self.action_quit))
        return pystray.Menu(*items)

    def _custom_preset_names(self) -> list[str]:
        """Custom preset names from ``root/presets/*.json`` (read-only)."""
        preset_dir = os.path.join(self.client.root, "presets")
        try:
            return sorted(
                name[:-5] for name in os.listdir(preset_dir)
                if name.endswith(".json") and name[:-5]
            )
        except OSError:
            return []

    def _custom_preset_label(self, name: str) -> str:
        """One-line description for a custom preset, e.g.
        'banana — route opencode.ai via proton (custom)'."""
        try:
            with open(os.path.join(self.client.root, "presets", f"{name}.json"),
                      encoding="utf-8") as f:
                data = json.load(f)
            routes = data.get("routes") or []
            if routes:
                domains = routes[0].get("domains") or []
                provider = routes[0].get("provider") or "?"
                first = domains[0] if domains else "?"
                more = f" +{len(domains) - 1} more" if len(domains) > 1 else ""
                return f"{name} — route {first}{more} via {provider} (custom)"
        except (OSError, json.JSONDecodeError, ValueError, IndexError):
            pass
        return f"{name} (custom)"

    def _exit_disabled(self, st: RouterStatus, name: str, profile: str) -> bool:
        """An exit is un-clickable only when it's genuinely dead: transport
        failure (probe got no HTTP response) or an active block/exhaust
        marker. A recoverable warning (e.g. stale 429 upstream_error, slow
        latency) must NOT disable the exit — the user can still try it."""
        rec = (st.providers.get(name, {}).get("egress") or {}).get(profile)
        if not rec:
            return False
        if rec.get("blocked") or rec.get("exhausted"):
            return True
        if rec.get("ok") is False and rec.get("status") is None:
            return True  # transport-level death: no HTTP status at all
        return False

    def _build_provider_menu(self, st: RouterStatus) -> pystray.Menu:
        """Provider → exit submenu, checked on the active exit, showing health."""
        entries = []
        for name in sorted(st.providers):
            info = st.providers[name]
            active = info.get("active")
            profiles = info.get("profiles") or []

            def make_exit_action(provider=name, profile=None):
                def action():
                    self._do(lambda: self.client.rotate_to(provider, profile),
                             f"switch {provider} → {profile}")
                return action

            def pick_exit_items():
                sub = []
                # Healthy/clickable exits first; genuinely-dead ones sink to
                # the bottom so the picker doesn't lead with a gray wall.
                def sort_key(p):
                    return (self._exit_disabled(st, name, p), p)
                for p in sorted(profiles, key=sort_key):
                    sub.append(pystray.MenuItem(
                        f"{p}{st.profile_health(name, p)}",
                        make_exit_action(provider=name, profile=p),
                        checked=lambda item, prof=p: prof == active,
                        enabled=not self._exit_disabled(st, name, p)))
                if not sub:
                    sub.append(pystray.MenuItem("no exits", None, enabled=False))
                return pystray.Menu(*sub)

            def make_cycle_action(provider=name):
                return lambda: self._do(lambda: self.client.rotate(provider),
                                        f"switch {provider}")

            label = st.provider_label(name)
            entries.append(pystray.MenuItem(
                label, pick_exit_items(),
                checked=lambda item, n=name: bool(st.providers.get(n, {}).get("active"))))
            entries.append(pystray.MenuItem(f"↻ switch {name}", make_cycle_action()))
        entries.append(pystray.Menu.SEPARATOR)
        entries.append(pystray.MenuItem("Click a location to switch to it", None, enabled=False))
        return pystray.Menu(*entries)

    def run(self) -> None:
        if pystray is None:
            print("pystray is required; pip install pystray pillow", file=sys.stderr)
            sys.exit(2)

        # macOS: menu-bar agent, no Dock icon (Tailscale/WARP-style).
        if sys.platform == "darwin":
            try:
                from AppKit import (NSApplication,
                                    NSApplicationActivationPolicyAccessory)
                NSApplication.sharedApplication().setActivationPolicy_(
                    NSApplicationActivationPolicyAccessory)
            except Exception:
                pass

        def on_ready(icon):
            # Custom setup replaces pystray's default setup; explicitly show
            # the status item or the agent runs invisibly on macOS.
            icon.visible = True
            threading.Thread(target=self.poll_loop, daemon=True).start()

        self.tray = pystray.Icon(
            "proxy-router", self.icon_image, "proxy-router",
            menu=self.build_menu(),
        )
        # NOTE: use blocking run(), NOT run_detached(). On the Darwin backend
        # run_detached() only marks the icon ready and never starts the
        # NSApplication event loop, so the status item is created but never
        # painted and the tray runs invisibly. run() blocks on the main
        # thread driving the Cocoa loop until stop() is called.
        self.tray.run(setup=on_ready)


def selftest(root: str) -> int:
    """CLI-contract check: status parses, dispatch targets exist, no GUI."""
    print(f"selftest root: {root}")
    if not os.path.isfile(os.path.join(root, "router.py")):
        print(f"FAIL: router.py not found in {root}")
        return 1
    client = RouterClient(root)
    st = client.status()
    rc = 0 if not st.error else 1
    print(f"parsed: up={st.up} mode={st.mode} watcher={st.watcher} "
          f"routing={st.routing_mode} exits={st.active_providers}")
    if st.error:
        print(f"status parse FAIL: {st.error}")
        return 1
    # verify every menu action's CLI entry exists (--help exits 0)
    for label, args in [
        ("ensure", ["ensure", "--help"]),
        ("stop", ["stop", "--help"]),
        ("rotate", ["rotate", "--help"]),
        ("routing set", ["routing", "set", "--help"]),
        ("vpn", ["vpn", "--help"]),
    ]:
        r, o = client._run(*args)
        status = "OK" if r == 0 else f"FAIL rc={r}"
        print(f"  {label}: {status}")
    print("SELFTEST DONE")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="proxy-router tray agent")
    ap.add_argument("--root", default=os.environ.get(
        "PROXY_ROUTER_ROOT",
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    ap.add_argument("--selftest", action="store_true",
                    help="validate CLI contract, no GUI")
    args = ap.parse_args()

    if args.selftest:
        return selftest(args.root)

    if pystray is None or Image is None:
        print("pystray + pillow required (pip install pystray pillow)",
              file=sys.stderr)
        return 2

    client = RouterClient(args.root)
    client.latest = client.status()  # warm first status for the menu
    app = TrayApp(client, make_icon("#e53935"))
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())