#!/usr/bin/env python3
"""Setup wizard for proxy-router: guides, profile imports, route presets, checks.

Stdlib only. Owns the non-engine half of ``proxy-router setup``:

- ``guide_text``      - bundled provider guides (Proton VPN Free, Cloudflare WARP)
- ``import_profiles`` - validates/dedupes/copies WireGuard ``.conf`` files
- ``apply_presets``   - idempotent safe route presets (opencode.ai, Roblox)
- ``check``           - reports provider profile availability (no network)
- ``bridge``          - installs/verifies the Hermes OpenCode auto-rotation
  bridge (``proxy-manager.sh``) at the path the Hermes plugin expects
- ``main`` / ``wizard`` - non-interactive CLI flags and a full-screen TUI
  (alternate screen, arrow-key navigation; plain line menu when not a TTY)

This module never starts sing-box, enables TUN, or touches networking on its
own. The only engine lifecycle call (menu item 8) shells out to the existing
``router.py ensure`` command, and only when the user explicitly selects it.
"""
from __future__ import annotations

import argparse
import configparser
import contextlib
import copy
import dataclasses
import glob
import io
import json
import os
import re
import select
import shutil
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

_PRESET_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")

try:
    import termios
    import tty
except ImportError:  # pragma: no cover - non-POSIX platforms
    termios = None
    tty = None

_HAVE_TERMIOS = termios is not None and tty is not None

ROOT = Path(os.environ.get("PROXY_ROUTER_ROOT") or Path(__file__).resolve().parent).resolve()

# Default Hermes config path for the bridge check (resolved via env at call
# time so tests can override; defaults to this module-level value).
_HERMES_CONFIG_DEFAULT = "~/.hermes/config.yaml"

# Guides live next to this module in the checkout/installed prefix. They are
# resolved from the module location (not ROOT) because the test harness
# relocates ROOT per-suite while the bundled guides are fixed files.
_GUIDES = {
    "proton": "proton-vpn-free.md",
    "warp": "cloudflare-warp.md",
}

# Idempotent safe presets: only ever added when their route id is absent,
# never merged into or replacing unrelated routes/providers.
_PRESET_ROUTES = {
    "opencode-zen": {
        "id": "opencode-zen",
        "domains": ["opencode.ai"],
        "provider": "proton",
    },
    "roblox": {
        "id": "roblox",
        "domains": ["roblox.com", "rbxcdn.com", "robloxlabs.com", "rblx.com"],
        "provider": "cloudflare",
    },
    "school": {
        "id": "school",
        "domains": [
            "discord.com",
            "discord.gg",
            "discordapp.com",
            "twitch.tv",
            "facebook.com",
            "fbcdn.net",
            "instagram.com",
            "cdninstagram.com",
            "youtube.com",
            "googlevideo.com",
            "ytimg.com",
            "x.com",
            "twitter.com",
            "cdn.sstatic.net",
        ],
        "provider": "cloudflare",
    },
}

# Built-in preset definitions: name -> {"routes": [..], "routing": {...}}.
# A preset is a NAMED bundle of routes (domains -> provider) plus an optional
# routing-mode section, applied by name with `setup --preset <name>`. Users
# add their own with `setup --preset-add NAME --provider P --domain ...`.
_BUILTIN_PRESETS: dict = {
    "opencode": {
        "routes": [_PRESET_ROUTES["opencode-zen"]],
        "routing": {"mode": "default"},
    },
    "roblox": {
        "routes": [_PRESET_ROUTES["roblox"]],
        "routing": {"mode": "default"},
    },
    "default": {  # the classic combo: opencode via proton + roblox via warp
        "routes": [_PRESET_ROUTES["opencode-zen"], _PRESET_ROUTES["roblox"]],
        "routing": {"mode": "default"},
    },
    "school-warp": {
        "routes": [_PRESET_ROUTES["school"]],
        "routing": {"mode": "vpn-list",
                    "vpn_domains": list(_PRESET_ROUTES["school"]["domains"])},
    },
}

ANSI = sys.stdout.isatty() and sys.stdin.isatty() and os.environ.get("NO_COLOR") is None


class _Ansi:
    RESET = "\x1b[0m"
    BOLD = "\x1b[1m"
    DIM = "\x1b[2m"
    RED = "\x1b[31m"
    GREEN = "\x1b[32m"
    YELLOW = "\x1b[33m"
    CYAN = "\x1b[36m"
    MAGENTA = "\x1b[35m"
    REVERSE = "\x1b[7m"
    # 256-color: true orange/purple (brand-ish, readable on light+dark).
    PURPLE = "\x1b[38;5;141m"
    ORANGE = "\x1b[38;5;208m"


def _style(text: str, *codes: str) -> str:
    return "".join(codes) + text + _Ansi.RESET if ANSI else text


_PROVIDER_RE = re.compile(r"\b(proton|cloudflare|warp)\b", re.IGNORECASE)


def _tint_provider(text: str) -> str:
    """Color provider names: Proton/WARP = purple, Cloudflare = orange.

    Applies AFTER width fitting so ANSI bytes never affect layout math.
    No-op when ANSI is disabled (NO_COLOR / non-TTY).
    """
    if not ANSI:
        return text

    def _repl(match: re.Match) -> str:
        word = match.group(0)
        color = _Ansi.PURPLE if word.lower() in ("proton", "warp") else _Ansi.ORANGE
        return color + word + _Ansi.RESET

    return _PROVIDER_RE.sub(_repl, text)


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------

def _valid_endpoint(endpoint: str) -> bool:
    """Basic host:port endpoint shape (bracketed IPv6 allowed, no DNS lookups)."""
    endpoint = endpoint.strip()
    if not endpoint:
        return False
    if endpoint.startswith("["):
        return re.fullmatch(r"\[[0-9a-fA-F:.%]+\]:\d+", endpoint) is not None
    host, sep, port = endpoint.rpartition(":")
    return bool(sep) and bool(host) and port.isdigit()


def inspect_profile(conf_path: Path) -> tuple[bool, str]:
    """Validate the minimum WireGuard structure of a ``.conf`` file.

    Returns (ok, reason). Checks ``[Interface]`` Address/PrivateKey,
    ``[Peer]`` PublicKey/Endpoint/AllowedIPs, and a parseable Endpoint -
    the same surface the engine's parser needs. Never returns file contents.
    """
    try:
        parser = configparser.ConfigParser(interpolation=None)
        if not parser.read(conf_path):
            return False, "unreadable file"
        if not parser.has_section("Interface"):
            return False, "missing [Interface] section"
        interface = parser["Interface"]
        for key in ("Address", "PrivateKey"):
            if not str(interface.get(key, "")).strip():
                return False, f"missing Interface.{key}"
        if not parser.has_section("Peer"):
            return False, "missing [Peer] section"
        peer = parser["Peer"]
        for key in ("PublicKey", "Endpoint", "AllowedIPs"):
            if not str(peer.get(key, "")).strip():
                return False, f"missing Peer.{key}"
        if not _valid_endpoint(str(peer["Endpoint"])):
            return False, "bad Peer.Endpoint (expected host:port or [v6]:port)"
        return True, "ok"
    except configparser.Error as exc:
        return False, f"not a parseable config: {exc}"
    except OSError as exc:
        return False, f"cannot read file: {exc}"


def validate_profile(conf_path: Path) -> bool:
    """Default single-file validator: True for a structurally valid profile."""
    ok, _ = inspect_profile(conf_path)
    return ok


def sanitize_name(name: str) -> str:
    """Lowercase, safe filename preserving a trailing ``.conf`` extension."""
    name = name.strip()
    stem = name[:-5] if name.lower().endswith(".conf") else name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem)
    stem = stem.strip("._-").lower()
    if not stem:
        stem = "profile"
    return stem + ".conf"


def _unique_target(destination: Path, name: str) -> Path:
    target = destination / name
    if not target.exists():
        return target
    stem = name[:-5] if name.lower().endswith(".conf") else Path(name).stem
    for index in range(2, 10_000):
        candidate = destination / f"{stem}-{index}.conf"
        if not candidate.exists():
            return candidate
    raise OSError(f"could not find a unique destination name for {name}")


def import_profiles(source, destination, validator=None) -> dict:
    """Copy valid WireGuard ``.conf`` profiles from ``source`` into ``destination``.

    ``source`` is a single ``.conf`` file or a directory of ``.conf`` files.
    Each profile is validated, given a sanitized, collision-free name, and
    written with mode 0600. Nothing about the contents is printed.

    Returns::

        {"imported": n, "rejected": n, "files": [names],
         "rejected_files": [{"name": ..., "reason": ...}]}
    """
    source = Path(source)
    destination = Path(destination)
    if source.is_dir():
        candidates = sorted(
            p for p in source.iterdir() if p.is_file() and p.suffix.lower() == ".conf"
        )
    else:
        candidates = [source]
    destination.mkdir(parents=True, exist_ok=True)

    files: list[str] = []
    rejected_files: list[dict] = []
    for candidate in candidates:
        name = candidate.name
        if not candidate.is_file():
            rejected_files.append({"name": name, "reason": "no such file"})
            continue
        if validator is None or validator is validate_profile:
            ok, reason = inspect_profile(candidate)
        else:
            try:
                ok = bool(validator(candidate))
            except Exception as exc:  # noqa: BLE001 - a broken custom validator
                ok, reason = False, f"validator error: {exc}"
            else:
                reason = "" if ok else "rejected by custom validator"
        if not ok:
            rejected_files.append({"name": name, "reason": reason or "invalid WireGuard profile"})
            continue
        try:
            target = _unique_target(destination, sanitize_name(name))
            shutil.copyfile(candidate, target)
            os.chmod(target, 0o600)
        except OSError as exc:
            rejected_files.append({"name": name, "reason": f"copy failed: {exc}"})
            continue
        files.append(target.name)

    return {
        "imported": len(files),
        "rejected": len(rejected_files),
        "files": files,
        "rejected_files": rejected_files,
    }


# ---------------------------------------------------------------------------
# guides
# ---------------------------------------------------------------------------

def guide_text(provider: str) -> str:
    """Return the bundled markdown guide; ``all`` combines them; unknown -> ""."""
    if provider == "all":
        return "\n\n".join(part for part in (guide_text("proton"), guide_text("warp")) if part)
    if provider not in _GUIDES:
        return ""
    try:
        return (Path(__file__).resolve().parent / "guides" / _GUIDES[provider]).read_text()
    except OSError:
        return ""


# ---------------------------------------------------------------------------
# presets
# ---------------------------------------------------------------------------

def _default_config() -> dict:
    example = Path(__file__).resolve().parent / "router.example.json"
    if example.is_file():
        return json.loads(example.read_text())
    return {
        "port": 2080,
        "providers": {},
        "routes": [],
        "vpn": {"address": ["172.19.0.1/30"], "mtu": 1500, "stack": "system"},
    }


def apply_presets(config_path, opencode=True, warp_roblox=True) -> dict:
    """Add the safe route presets to ``router.json`` (idempotent, lossless).

    Adds providers ``proton``/``cloudflare`` and routes ``opencode-zen``
    (opencode.ai -> proton) and ``roblox`` (Roblox domains -> cloudflare) when
    missing, leaving every other key, provider, route, and value untouched.
    Returns ``{"added": [route ids created this call]}``.
    """
    config_path = Path(config_path)
    if config_path.is_file():
        data = json.loads(config_path.read_text())
    else:
        data = _default_config()
    providers = data.setdefault("providers", {})
    routes = data.setdefault("routes", [])

    added: list[str] = []
    if opencode:
        providers.setdefault("proton", {"directory": "providers/proton", "cooldown_seconds": 60})
        if not any(r.get("id") == "opencode-zen" for r in routes):
            routes.append(dict(_PRESET_ROUTES["opencode-zen"]))
            added.append("opencode-zen")
    if warp_roblox:
        providers.setdefault(
            "cloudflare", {"directory": "providers/cloudflare", "cooldown_seconds": 60}
        )
        if not any(r.get("id") == "roblox" for r in routes):
            routes.append(dict(_PRESET_ROUTES["roblox"]))
            added.append("roblox")
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(config_path, 0o600)
    return {"added": added}


def custom_preset_path(root: Path, name: str) -> Path:
    """Path of the custom preset file for ``name`` under ``root/presets/``.

    Preset names are validated like provider names (letters/digits/._-), so a
    name can never escape the presets directory.
    """
    if not _PRESET_NAME.fullmatch(name):
        raise ValueError(
            f"invalid preset name '{name}' (use letters, digits, '.', '_', '-'; max 64)"
        )
    return root / "presets" / f"{name}.json"


def preset_names(root: Path) -> list[str]:
    """All available preset names: built-ins first, then custom files."""
    names = sorted(_BUILTIN_PRESETS)
    try:
        custom_dir = root / "presets"
        if custom_dir.is_dir():
            names += sorted(p.stem for p in custom_dir.glob("*.json"))
    except OSError:
        pass
    result: list[str] = []
    for name in names:
        if name not in result:
            result.append(name)
    return result


def load_preset(root: Path, name: str) -> dict:
    """Load a preset definition (built-in or custom) as
    ``{"routes": [...], "routing": {...}, "providers": {...}}``."""
    if name in _BUILTIN_PRESETS:
        return dict(_BUILTIN_PRESETS[name])
    path = custom_preset_path(root, name)
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"preset '{name}' is not loadable: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"preset '{name}' must be a JSON object")
    return data


def apply_preset_by_name(root: Path, name: str) -> dict:
    """Apply the preset ``name`` to ``root/router.json`` (idempotent, lossless).

    Adds the preset's routes/providers and merges its ``routing`` section
    (mode switch when the preset defines one; a ``default`` routing is left
    untouched). Never starts the engine.
    Returns ``{"added": [...], "mode": ..., "preset": name}``.
    """
    config_path = root / "router.json"
    if config_path.is_file():
        data = json.loads(config_path.read_text())
    else:
        data = _default_config()
    preset = load_preset(root, name)
    providers = data.setdefault("providers", {})
    routes = data.setdefault("routes", [])
    for provider in preset.get("providers", {}):
        providers.setdefault(provider, dict(preset["providers"][provider]))
    added: list[str] = []
    for route in preset.get("routes", []):
        if route.get("provider") and route["provider"] not in providers:
            providers.setdefault(route["provider"], {
                "directory": f"providers/{route['provider']}", "cooldown_seconds": 60})
        if not any(r.get("id") == route.get("id") for r in routes):
            routes.append(dict(route))
            added.append(str(route.get("id")))
    routing = preset.get("routing") or {}
    mode = routing.get("mode", "default")
    if mode != "default":
        data["routing"] = data.get("routing") or {}
        data["routing"].update({k: v for k, v in routing.items() if v is not None})
        # never clobber an explicitly-set default_provider with None
        if routing.get("default_provider"):
            data["routing"]["default_provider"] = routing["default_provider"]
    config_path.parent.mkdir(parents=True, exist_ok=True)
    # record the applied preset so `status` (and the tray) can show it
    data["preset"] = name
    config_path.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(config_path, 0o600)
    return {"added": added, "mode": mode, "preset": name}


def add_custom_preset(root: Path, name: str, provider: str, domains: list[str],
                      mode: str = "vpn-list", default_provider: str | None = None) -> Path:
    """Create a custom named preset file under ``root/presets/``.

    Custom presets are the "make it yours" path: pick a name, a provider
    (proton, cloudflare, or any configured exit), and the domains that ride
    it. The remaining routing mode defaults to vpn-list (only these domains
    tunneled) — the configurable inverse of safe-list.
    """
    domain_list = [d for d in domains if d]
    if not domain_list:
        raise ValueError("preset needs at least one domain")
    routing: dict = {"mode": mode}
    if mode == "vpn-list":
        routing["vpn_domains"] = domain_list
    elif mode == "safe-list":
        routing["direct_domains"] = domain_list
        if default_provider:
            routing["default_provider"] = default_provider
    elif mode == "default":
        routing = {"mode": "default"}
    preset = {
        "routes": [{"id": name, "domains": domain_list, "provider": provider}],
        "routing": routing,
    }
    path = custom_preset_path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(preset, indent=2) + "\n")
    os.chmod(path, 0o600)
    return path


# ---------------------------------------------------------------------------
# non-interactive commands
# ---------------------------------------------------------------------------

def check(root) -> dict:
    """Report provider profile availability from ``root/router.json``.

    Network-free: every configured provider needs at least one valid
    ``*.conf`` profile in its directory. Returns ``{"ok": bool, "issues": []}``.
    """
    root = Path(root)
    config_file = root / "router.json"
    if not config_file.is_file():
        return {"ok": False, "issues": [f"missing {config_file}"]}
    try:
        data = json.loads(config_file.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return {"ok": False, "issues": [f"bad {config_file.name}: {exc}"]}
    providers = data.get("providers") or {}
    if not providers:
        return {"ok": False, "issues": ["no providers configured in router.json"]}
    issues: list[str] = []
    for name, entry in providers.items():
        directory = root / (entry or {}).get("directory", f"providers/{name}")
        if not directory.is_dir():
            issues.append(f"provider '{name}': missing directory {directory}")
            continue
        if not any(validate_profile(p) for p in directory.glob("*.conf")):
            issues.append(f"provider '{name}': no valid .conf profile in {directory}")
    return {"ok": not issues, "issues": issues}


def _expand_paths(paths) -> list[Path]:
    """Expand ~ and glob patterns into a de-duplicated list of paths."""
    expanded: list[Path] = []
    seen: set[str] = set()
    for raw in paths:
        raw = os.path.expanduser(raw)
        if any(ch in raw for ch in "*?["):
            matches = sorted(glob.glob(raw))
            candidates = matches or [raw]
        else:
            candidates = [raw]
        for candidate in candidates:
            key = os.path.abspath(candidate)
            if key not in seen:
                seen.add(key)
                expanded.append(Path(candidate))
    return expanded


def _merge_results(results: list[dict]) -> dict:
    return {
        "imported": sum(r["imported"] for r in results),
        "rejected": sum(r["rejected"] for r in results),
        "files": [f for r in results for f in r["files"]],
        "rejected_files": [f for r in results for f in r["rejected_files"]],
    }


def _cmd_guide(provider: str) -> int:
    text = guide_text(provider)
    if not text:
        print(f"setup: no guide available for '{provider}'", file=sys.stderr)
        return 1
    print(_style(f"--- {_tint_provider(provider)} setup guide ---", _Ansi.BOLD, _Ansi.CYAN))
    print(text)
    return 0


def _cmd_check(root: Path) -> int:
    result = check(root)
    if result["ok"]:
        print(_style("setup: ok - every provider has at least one valid profile", _Ansi.GREEN))
        return 0
    for issue in result["issues"]:
        print(_style(f"setup: {issue}", _Ansi.RED), file=sys.stderr)
    print(_style("setup: check failed", _Ansi.RED), file=sys.stderr)
    return 1


def _cmd_import(root: Path, provider: str, paths) -> int:
    destination = root / "providers" / provider
    sources = _expand_paths(paths) or [Path(paths[0])]
    merged = _merge_results([import_profiles(src, destination) for src in sources])
    if merged["imported"]:
        print(_style(
            f"setup: imported {merged['imported']} profile(s) into providers/{provider}",
            _Ansi.GREEN,
        ))
        for name in merged["files"]:
            print(_style(f"  + {name}", _Ansi.DIM))
    for entry in merged["rejected_files"]:
        print(_style(f"  - {entry['name']}: {entry['reason']}", _Ansi.YELLOW))
    if merged["rejected"]:
        print(_style(f"setup: rejected {merged['rejected']} file(s)", _Ansi.YELLOW))
    return 0 if merged["imported"] else 1


def _cmd_preset(root: Path) -> int:
    config_path = root / "router.json"
    try:
        result = apply_presets(config_path)
    except (json.JSONDecodeError, OSError) as exc:
        print(_style(f"setup: preset failed: {exc}", _Ansi.RED), file=sys.stderr)
        return 1
    if result["added"]:
        print(_style(_tint_provider("setup: added route preset(s): " + ", ".join(result["added"])), _Ansi.GREEN))
    else:
        print(_style(_tint_provider("setup: route presets already applied (nothing to add)"), _Ansi.GREEN))
    print(f"setup: wrote {config_path}")
    return 0


def _cmd_preset_prompt(root: Path) -> int:
    """Line-menu flow: pick a preset by name (built-in or custom) and apply it,
    or create a new custom preset interactively."""
    names = preset_names(root)
    if not names:
        print(_style("  no presets available", _Ansi.RED), file=sys.stderr)
        return 1
    print(_style("  available presets: " + ", ".join(names), _Ansi.BOLD))
    print(_style("  create a new one with:  new", _Ansi.BOLD))
    name = input("  preset name (empty cancels, 'new' creates): ").strip().lower()
    if not name:
        return 1
    if name == "new":
        return _cmd_preset_create_prompt(root)
    if name not in names:
        print(_style(f"  unknown preset '{name}' — use one of: {', '.join(names)}", _Ansi.RED), file=sys.stderr)
        return 1
    try:
        result = apply_preset_by_name(root, name)
    except (ValueError, json.JSONDecodeError, OSError) as exc:
        print(_style(f"  preset apply failed: {exc}", _Ansi.RED), file=sys.stderr)
        return 1
    label = f"preset '{result['preset']}' applied — routing={result['mode']}"
    if result["added"]:
        label += f", added route(s): {', '.join(result['added'])}"
    else:
        label += " (already present, nothing added)"
    print(_style(_tint_provider(label), _Ansi.GREEN))
    print("  run menu item 8 (`ensure`) to apply; engine untouched for now.")
    return 0


def _cmd_preset_create_prompt(root: Path) -> int:
    """Line-menu create flow: name -> provider -> comma-separated domains.
    Writes the preset file only; the engine is never started here."""
    try:
        name = input("  new preset name (empty cancels): ").strip().lower()
        if not name:
            return 1
        try:
            custom_preset_path(root, name)  # validates the name
        except ValueError as exc:
            print(_style(f"  {exc}", _Ansi.RED), file=sys.stderr)
            return 1
        if name in preset_names(root):
            print(_style(f"  preset '{name}' already exists — pick another name", _Ansi.RED), file=sys.stderr)
            return 1
        provider = input("  provider for this preset (proton / cloudflare / other): ").strip()
        if not provider:
            print(_style("  provider cannot be empty", _Ansi.RED), file=sys.stderr)
            return 1
        domain_text = input("  domains to tunnel, comma-separated (e.g. opencode.ai,roblox.com): ").strip()
        if not domain_text:
            print(_style("  at least one domain is required", _Ansi.RED), file=sys.stderr)
            return 1
        path = add_custom_preset(root, name, provider,
                                 [d.strip() for d in domain_text.split(",") if d.strip()])
    except (EOFError, KeyboardInterrupt):
        print()
        return 130
    except (ValueError, OSError) as exc:
        print(_style(f"  preset create failed: {exc}", _Ansi.RED), file=sys.stderr)
        return 1
    print(_style(f"  custom preset '{name}' written to {path.relative_to(root or Path('.'))} (not applied)", _Ansi.GREEN))
    print("  apply it now with 's', or from the tray: Presets → your name")
    return 0


# ---------------------------------------------------------------------------
# Hermes OpenCode auto-rotation bridge
# ---------------------------------------------------------------------------

def bridge_root() -> Path:
    """Machine-level VPN root that the Hermes rotation plugin expects.

    Mirrors the plugin's lookup exactly: ``OPENCODE_ZEN_VPN_ROOT`` env
    override, else the plugin's compiled-in default (hardcoded here only).
    ``expanduser`` so ``~`` prefixes work in the env value.
    """
    return Path(
        os.environ.get("OPENCODE_ZEN_VPN_ROOT", "/Users/kyson/airi/tools/opencode-zen-vpn")
    ).expanduser()


def _hermes_config_path() -> Path:
    """Hermes config path, resolved from env at call time (default module global)."""
    return Path(os.environ.get("HERMES_CONFIG", _HERMES_CONFIG_DEFAULT)).expanduser()


def _hermes_plugin_enabled() -> bool:
    """Best-effort: is ``opencode-server-rotation`` listed under a plugins: block?

    Read-only and never fatal: an unreadable/missing config reports not
    enabled. A simple scan of parsed lines keeps this dependency-free.
    """
    try:
        lines = _hermes_config_path().read_text().splitlines()
    except (OSError, UnicodeDecodeError):
        return False
    section = ""
    for line in lines:
        if line and not line[0].isspace():
            section = line.split(":", 1)[0].strip()
        if section == "plugins" and "opencode-server-rotation" in line:
            return True
    return False


def _cmd_bridge_check(root: Path | None = None) -> int:
    """Verify the Hermes rotation bridge; no side effects, one line per check.

    ``root`` is accepted for CLI symmetry but placement always comes from
    ``OPENCODE_ZEN_VPN_ROOT`` (this is a machine-level Hermes integration,
    not a repo file). The Hermes plugin-enabled line is informational only
    and does not affect the exit code.
    """
    manager = bridge_root() / "proxy-manager.sh"
    ok = True

    if manager.is_file():
        print(_style(f"bridge: manager present ({manager})", _Ansi.GREEN))
    else:
        print(_style(f"bridge: manager missing ({manager})", _Ansi.RED))
        ok = False

    if os.access(manager, os.X_OK):
        print(_style("bridge: executable", _Ansi.GREEN))
    else:
        print(_style("bridge: not executable", _Ansi.RED))
        ok = False

    if manager.is_file():
        try:
            result = subprocess.run(["bash", "-n", str(manager)], capture_output=True, text=True)
        except OSError as exc:
            print(_style(f"bridge: syntax check skipped (bash unavailable: {exc})", _Ansi.YELLOW))
        else:
            if result.returncode == 0:
                print(_style("bridge: syntax ok", _Ansi.GREEN))
            else:
                print(_style(f"bridge: syntax error: {result.stderr.strip() or result.stdout.strip()}", _Ansi.RED))
                ok = False
    else:
        print(_style("bridge: syntax check skipped (manager missing)", _Ansi.YELLOW))

    vpn_root = bridge_root()
    if os.environ.get("OPENCODE_ZEN_VPN_ROOT"):
        print(f"bridge: vpn root {vpn_root} (env OPENCODE_ZEN_VPN_ROOT)")
    else:
        print(f"bridge: vpn root {vpn_root} (default)")

    if _hermes_plugin_enabled():
        print(_style("bridge: hermes plugin enabled (opencode-server-rotation)", _Ansi.GREEN))
    else:
        print(_style("bridge: hermes plugin NOT enabled (add plugins: - opencode-server-rotation)", _Ansi.YELLOW))
    return 0 if ok else 1


def _cmd_bridge_install(root: Path, force: bool = False) -> int:
    """Install the Hermes OpenCode auto-rotation bridge and validate it.

    Copies ``examples/proxy-manager.sh`` to ``OPENCODE_ZEN_VPN_ROOT/
    proxy-manager.sh`` (a machine-level Hermes integration, not a repo
    config file), chmod 0755, then runs ``bash -n`` and removes the file
    on failure. Idempotent when content is already identical; refuses to
    overwrite a differing existing file unless ``force`` is set.
    """
    source = Path(__file__).resolve().parent / "examples" / "proxy-manager.sh"
    target_dir = bridge_root()
    target = target_dir / "proxy-manager.sh"

    try:
        payload = source.read_bytes()
    except OSError as exc:
        print(f"bridge: cannot read source {source}: {exc}", file=sys.stderr)
        return 1

    if target.is_file():
        try:
            if target.read_bytes() == payload:
                print(_style(f"bridge: already up to date ({target})", _Ansi.GREEN))
                return 0
        except OSError as exc:
            if not force:
                print(_style(f"bridge: existing {target} not readable ({exc})", _Ansi.RED), file=sys.stderr)
                return 1
        if not force:
            print(
                _style(
                    f"bridge: refusing to overwrite existing {target} "
                    "(use --bridge-force-install)",
                    _Ansi.YELLOW,
                ),
                file=sys.stderr,
            )
            return 1
    elif target.exists():
        if not force:
            print(_style(f"bridge: refusing to replace non-file path {target}", _Ansi.YELLOW), file=sys.stderr)
            return 1

    created_dir = not target_dir.is_dir()
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        if created_dir:
            os.chmod(target_dir, 0o700)
        shutil.copy2(source, target)
        os.chmod(target, 0o755)
    except OSError as exc:
        print(f"bridge: install failed: {exc}", file=sys.stderr)
        return 1

    try:
        result = subprocess.run(["bash", "-n", str(target)], capture_output=True, text=True)
    except OSError as exc:
        print(f"bridge: bash unavailable after install ({exc})", file=sys.stderr)
        return 1
    if result.returncode != 0:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
        print(
            f"bridge: syntax check failed, removed {target}: "
            f"{result.stderr.strip() or result.stdout.strip()}",
            file=sys.stderr,
        )
        return 1
    print(_style(f"bridge: installed -> {target}", _Ansi.GREEN))
    return 0


def _router_command(root: Path, *args: str) -> int:
    """Run the existing router CLI against ``root`` (never enabled implicitly)."""
    script = Path(__file__).resolve().parent / "router.py"
    env = dict(os.environ, PROXY_ROUTER_ROOT=str(root))
    try:
        return subprocess.call([sys.executable, str(script), *args], env=env)
    except OSError as exc:
        print(f"setup: could not run {script}: {exc}", file=sys.stderr)
        return 1


def _read_routing_state(root: Path) -> dict:
    """Read-only view of the persisted routing section (no mutation, no
    subprocess): the TUI renders from this; every change goes through the
    ``router.py routing`` CLI writer below."""
    try:
        data = json.loads((Path(root) / "router.json").read_text())
        routing = data.get("routing") or {}
        if not isinstance(routing, dict):
            routing = {}
    except (OSError, json.JSONDecodeError):
        routing = {}
    return {
        "mode": routing.get("mode", "default"),
        "direct_domains": list(routing.get("direct_domains", []) or []),
        "vpn_domains": list(routing.get("vpn_domains", []) or []),
        "default_provider": routing.get("default_provider"),
    }


def _routing_lines(root: Path) -> list[str]:
    state = _read_routing_state(root)
    direct = ", ".join(state["direct_domains"]) or "(none)"
    vpn = ", ".join(state["vpn_domains"]) or "(none)"
    return [
        f"mode: {state['mode']}",
        f"direct_domains: {direct}",
        f"vpn_domains: {vpn}",
        f"default_provider: {state['default_provider'] or '(none)'}",
    ]


def _cmd_routing(root: Path) -> None:
    """Line-menu flow for routing modes. Every mutation shells out to the
    existing ``router.py routing`` CLI - one config writer, never a second
    mutation path - and the engine is never started or reloaded here."""
    while True:
        _router_command(root, "routing", "show")
        print(_style("  [1] set vpn-list   [2] set safe-list   [3] add direct   [4] remove direct"
                     "   [5] add vpn   [6] remove vpn   [b] back", _Ansi.BOLD))
        try:
            choice = input(_style("routing> ", _Ansi.BOLD)).strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if choice in ("b", "back", "q"):
            return
        if choice == "1":
            _router_command(root, "routing", "set", "--mode", "vpn-list")
        elif choice == "2":
            provider = input("  default provider (empty keeps the current one): ").strip()
            args = ["routing", "set", "--mode", "safe-list"]
            if provider:
                args += ["--default-provider", provider]
            _router_command(root, "routing", *args)
        elif choice == "3":
            domain = input("  domain to go DIRECT: ").strip()
            if domain:
                _router_command(root, "routing", "add", "--mode", "safe-list", "--domain", domain)
        elif choice == "4":
            domain = input("  domain to remove from the direct list: ").strip()
            if domain:
                _router_command(root, "routing", "remove", "--mode", "safe-list", "--domain", domain)
        elif choice == "5":
            domain = input("  domain to TUNNEL: ").strip()
            if domain:
                _router_command(root, "routing", "add", "--mode", "vpn-list", "--domain", domain)
        elif choice == "6":
            domain = input("  domain to remove from the vpn list: ").strip()
            if domain:
                _router_command(root, "routing", "remove", "--mode", "vpn-list", "--domain", domain)
        else:
            print(f"  unknown choice '{choice}'")


# ---------------------------------------------------------------------------
# interactive wizard
# ---------------------------------------------------------------------------

_BANNER = """
  proxy-router setup wizard
  -------------------------
  Guides, profile imports, route presets and health checks.
  The engine is never started unless you explicitly pick item 8.
"""

_MENU = [
    ("1", "Show Proton VPN guide"),
    ("2", "Show Cloudflare WARP guide"),
    ("3", "Show both guides"),
    ("4", "Import Proton VPN profiles (.conf file or directory)"),
    ("5", "Import Cloudflare WARP profiles (.conf file or directory)"),
    ("6", "Apply route presets (opencode.ai -> proton, roblox -> cloudflare)"),
    ("7", "Check provider health"),
    ("8", "Start / reload the proxy engine (explicit action)"),
    ("9", "Install / verify OpenCode auto-rotation bridge (Hermes)"),
    ("r", "Routing modes (safe-list / vpn-list / default)"),
    ("s", "Presets: apply, browse, or create (built-in + custom)"),
    ("q", "Quit"),
]


def _print_menu() -> None:
    print(_style(_BANNER, _Ansi.CYAN))
    for key, label in _MENU:
        print(f"  {_style(key, _Ansi.BOLD)}  {_tint_provider(label)}")
    print()


def _prompt_import(root: Path, provider: str) -> None:
    label = "Proton VPN" if provider == "proton" else "Cloudflare WARP"
    try:
        answer = input(f"  path to .conf file or directory ({_tint_provider(label)}): ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if not answer:
        return
    _cmd_import(root, provider, [answer])


def _line_wizard(root: Path) -> int:
    """Line-based fallback: used whenever either stream is not a real TTY."""
    while True:
        _print_menu()
        try:
            choice = input(_style("setup> ", _Ansi.BOLD)).strip().lower()
        except EOFError:
            print()
            return 0
        except KeyboardInterrupt:
            print()
            return 130
        if choice in ("q", "quit"):
            return 0
        if choice == "1":
            _cmd_guide("proton")
        elif choice == "2":
            _cmd_guide("warp")
        elif choice == "3":
            _cmd_guide("all")
        elif choice == "4":
            _prompt_import(root, "proton")
        elif choice == "5":
            _prompt_import(root, "cloudflare")
        elif choice == "6":
            _cmd_preset(root)
        elif choice == "7":
            _cmd_check(root)
        elif choice == "8":
            print(_style("  starting/reloading the proxy engine (router ensure)...", _Ansi.YELLOW))
            rc = _router_command(root, "ensure")
            if rc == 0:
                print(_style("  engine up", _Ansi.GREEN))
            else:
                print(_style("  engine failed to start (see router output above)", _Ansi.RED))
        elif choice == "9":
            _cmd_bridge_install(root)
        elif choice == "r":
            _cmd_routing(root)
        elif choice == "s":
            _cmd_preset_prompt(root)
        else:
            print(f"  unknown choice '{choice}' (enter a number or 'q')")


# ---------------------------------------------------------------------------
# full-screen TUI: state, pure key handling and frame rendering
# ---------------------------------------------------------------------------

# TUI menu keeps the same actions plus Quit (digit 0; q/Q/ESC also quit).
TUI_MENU = [
    ("1", "Show Proton guide"),
    ("2", "Show Cloudflare guide"),
    ("3", "Show both guides"),
    ("4", "Import Proton profiles"),
    ("5", "Import Cloudflare profiles"),
    ("6", "Apply route presets (opencode.ai -> proton, roblox -> cloudflare)"),
    ("7", "Check provider health"),
    ("8", "Start/reload the proxy engine"),
    ("9", "Install / verify OpenCode auto-rotation bridge (Hermes)"),
    ("r", "Routing modes (show / switch / add-remove domain)"),
    ("s", "Presets: apply by name / create custom (built-in + custom)"),
    ("0", "Quit"),
]
TUI_MENU_INDEX = {key: index for index, (key, _) in enumerate(TUI_MENU)}

UP = "\x1b[A"
DOWN = "\x1b[B"
ESC = "\x1b"
ENTER = "\r"
BACKSPACE = "\x7f"

_ANSI_ESC_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _strip_ansi(text: str) -> str:
    """Remove ANSI SGR sequences so captured action output stays box-safe."""
    return _ANSI_ESC_RE.sub("", text)


@dataclasses.dataclass
class TuiState:
    """Pure TUI state; view is one of "menu" | "guide" | "import" |
    "routing" | "routing_prompt"."""

    view: str = "menu"
    cursor: int = 0
    guide_provider: str = "proton"
    guide_lines: list = dataclasses.field(default_factory=list)
    guide_scroll: int = 0
    import_provider: str = "proton"
    import_text: str = ""
    routing_lines: list = dataclasses.field(default_factory=list)
    routing_prompt_label: str = ""
    routing_prompt_text: str = ""
    routing_prompt_args: tuple = ()
    preset_browser: bool = False          # routing view showing presets (s), not routing actions
    preset_step: int = 0                  # 0=name, 1=provider, 2=domains
    preset_name: str = ""
    preset_provider: str = ""
    status: str = ""
    status_ok: bool = True
    action: tuple | None = None  # recorded machine action for the wizard loop
    quit: bool = False
    cols: int = 80
    rows: int = 24
    root: Path = ROOT


def _initial_state(root: Path | None = None) -> TuiState:
    size = shutil.get_terminal_size((80, 24))
    state = TuiState(cols=max(size.columns, 40), rows=max(size.lines, 18))
    if root is not None:
        state.root = Path(root).resolve()
    return state


def _fit(text: str, width: int) -> str:
    """Truncate/pad ``text`` to exactly ``width`` columns."""
    if len(text) > width:
        if width <= 1:
            return text[:width]
        return text[: width - 1] + "\u2026"  # horizontal ellipsis
    return text + " " * (width - len(text))


def _wrap_guide(text: str, width: int) -> list[str]:
    """Split guide markdown into screen lines wrapped to ``width``."""
    width = max(width, 10)
    lines: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            lines.append("")
        else:
            lines.extend(textwrap.wrap(line, width) or [""])
    return lines


def _render_menu(state: TuiState) -> list[str]:
    inner = max(state.cols - 2, 30)
    lines = ["\u250c" + "\u2500" * inner + "\u2510"]
    header = _style(_fit(" proxy-router setup ", inner), _Ansi.BOLD, _Ansi.CYAN)
    lines.append("\u2502" + header + "\u2502")
    lines.append("\u2502" + _fit(" Guides \u00b7 imports \u00b7 presets \u00b7 health checks ", inner) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    for index, (key, label) in enumerate(TUI_MENU):
        right = f" {key} "
        prefix = f"  {key}  "
        fitted = _fit(prefix + label, inner - len(right))
        label_plain = fitted[len(prefix):]
        label_tint = _tint_provider(label_plain)
        if index == state.cursor:
            row = "\u2502" + prefix + label_tint + right + "\u2502"
            lines.append(_style(row, _Ansi.REVERSE))
        else:
            lines.append("\u2502" + _style(prefix, _Ansi.CYAN) + label_tint + right + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    status_lines = [ln for ln in state.status.splitlines() if ln.strip()] or ["Ready \u2014 pick an item."]
    for ln in status_lines[-2:]:
        plain = _strip_ansi(ln)
        if plain.strip() == "Ready \u2014 pick an item.":
            styled = _style(_fit(" " + plain, inner), _Ansi.DIM)
        elif state.status_ok:
            styled = _style(_fit(" " + plain, inner), _Ansi.GREEN)
        else:
            styled = _style(_fit(" " + plain, inner), _Ansi.RED)
        lines.append("\u2502" + styled + "\u2502")
    lines.append("\u2502" + _style(_fit(" \u2191\u2193 navigate \u00b7 Enter select \u00b7 q/ESC quit ", inner), _Ansi.DIM) + "\u2502")
    lines.append("\u2514" + "\u2500" * inner + "\u2518")
    return lines


def _render_guide(state: TuiState) -> list[str]:
    inner = max(state.cols - 2, 30)
    titles = {
        "proton": "Show Proton VPN guide",
        "warp": "Show Cloudflare WARP guide",
        "all": "Show both guides",
    }
    title = titles.get(state.guide_provider, "Guide")
    lines = ["\u250c" + "\u2500" * inner + "\u2510"]
    title_fit = _fit(f" {title} ", inner)
    lines.append("\u2502" + _style(_tint_provider(title_fit), _Ansi.BOLD, _Ansi.CYAN) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    visible = max(state.rows - 5, 1)
    scroll = min(state.guide_scroll, max(0, len(state.guide_lines) - visible))
    for index in range(visible):
        src = state.guide_lines[scroll + index] if scroll + index < len(state.guide_lines) else ""
        lines.append("\u2502" + _fit(src, inner) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    total = len(state.guide_lines)
    shown = min(scroll + 1, total) if total else 0
    lines.append("\u2502" + _style(_fit(f" line {shown}/{total} \u00b7 \u2191\u2193 scroll \u00b7 q back ", inner), _Ansi.DIM) + "\u2502")
    lines.append("\u2514" + "\u2500" * inner + "\u2518")
    return lines


def _render_import(state: TuiState) -> list[str]:
    inner = max(state.cols - 2, 30)
    title = (
        "Import Proton VPN profiles"
        if state.import_provider == "proton"
        else "Import Cloudflare WARP profiles"
    )
    lines = ["\u250c" + "\u2500" * inner + "\u2510"]
    title_fit = _fit(f" {title} ", inner)
    lines.append("\u2502" + _style(_tint_provider(title_fit), _Ansi.BOLD, _Ansi.CYAN) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    path_display = state.import_text or "no path yet"
    lines.append("\u2502" + _fit(" path: " + path_display, inner) + "\u2502")
    lines.append("\u2502" + _style(_fit(" Enter submits \u00b7 ESC cancels \u00b7 backspace edits ", inner), _Ansi.DIM) + "\u2502")
    lines.append("\u2514" + "\u2500" * inner + "\u2518")
    return lines


_ROUTING_ACTIONS = [
    ("1", "switch to vpn-list (only listed domains tunneled)"),
    ("2", "switch to safe-list (everything else via default_provider)"),
    ("3", "add domain to the direct list"),
    ("4", "remove domain from the direct list"),
    ("5", "add domain to the vpn list"),
    ("6", "remove domain from the vpn list"),
    ("7", "apply a preset by name (built-in or custom)"),
]
_PRESET_ACTIONS = [
    ("1", "apply a preset by name (built-in or custom)"),
    ("2", "create a new preset (name, provider, domain)"),
]
_PRESET_PROMPT_LABEL = "preset name to apply (built-in or custom):"
_PRESET_CREATE_LABELS = [
    "new preset name (e.g. banana):",
    "provider for the preset (proton / cloudflare):",
    "domain(s) to route (comma-separated, e.g. opencode.ai):",
]


def _render_routing(state: TuiState) -> list[str]:
    """Routing-modes view (r) or presets browser (s). Rendered read-only;
    every change is executed by the wizard loop through the router CLI
    (routing) or add_custom_preset (preset create)."""
    inner = max(state.cols - 2, 30)
    if state.preset_browser:
        title = " presets "
        lines = ["\u250c" + "\u2500" * inner + "\u2510"]
        lines.append("\u2502" + _style(_fit(title, inner), _Ansi.BOLD, _Ansi.CYAN) + "\u2502")
        lines.append("\u251c" + "\u2500" * inner + "\u2524")
        for ln in state.routing_lines:
            lines.append("\u2502" + _fit(" " + ln, inner) + "\u2502")
        lines.append("\u251c" + "\u2500" * inner + "\u2524")
        for key, label in _PRESET_ACTIONS:
            lines.append("\u2502" + _style(_fit(f"  {key}  {label}", inner), _Ansi.CYAN) + "\u2502")
        lines.append("\u251c" + "\u2500" * inner + "\u2524")
        lines.append("\u2502" + _style(_fit(" 1-2 change \u00b7 ESC back ", inner), _Ansi.DIM) + "\u2502")
        lines.append("\u2514" + "\u2500" * inner + "\u2518")
        return lines
    lines = ["\u250c" + "\u2500" * inner + "\u2510"]
    lines.append("\u2502" + _style(_fit(" routing modes ", inner), _Ansi.BOLD, _Ansi.CYAN) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    for ln in state.routing_lines:
        lines.append("\u2502" + _fit(" " + ln, inner) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    for key, label in _ROUTING_ACTIONS:
        lines.append("\u2502" + _style(_fit(f"  {key}  {label}", inner), _Ansi.CYAN) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    lines.append("\u2502" + _style(_fit(" 1-7 change \u00b7 writes go through the router CLI \u00b7 ESC back ", inner), _Ansi.DIM) + "\u2502")
    lines.append("\u2514" + "\u2500" * inner + "\u2518")
    return lines


def _render_routing_prompt(state: TuiState) -> list[str]:
    """Single-field text input for routing mutations (domain/provider)."""
    inner = max(state.cols - 2, 30)
    lines = ["\u250c" + "\u2500" * inner + "\u2510"]
    lines.append("\u2502" + _style(_fit(" routing input ", inner), _Ansi.BOLD, _Ansi.CYAN) + "\u2502")
    lines.append("\u251c" + "\u2500" * inner + "\u2524")
    lines.append("\u2502" + _fit(" " + (state.routing_prompt_label or "input:"), inner) + "\u2502")
    display = state.routing_prompt_text or "no input yet"
    lines.append("\u2502" + _fit(" input: " + display, inner) + "\u2502")
    lines.append("\u2502" + _style(_fit(" Enter submits \u00b7 ESC cancels \u00b7 backspace edits ", inner), _Ansi.DIM) + "\u2502")
    lines.append("\u2514" + "\u2500" * inner + "\u2518")
    return lines


def render_frame(state: TuiState) -> list[str]:
    """Build the full frame (header, body, footer) as a list of screen lines."""
    if state.view == "guide":
        return _render_guide(state)
    if state.view == "import":
        return _render_import(state)
    if state.view == "routing":
        return _render_routing(state)
    if state.view == "routing_prompt":
        return _render_routing_prompt(state)
    return _render_menu(state)


def _open_guide(state: TuiState, provider: str) -> None:
    text = guide_text(provider)
    if not text:
        state.status = f"no {provider} guide available"
        state.status_ok = False
        return
    state.view = "guide"
    state.guide_provider = provider
    state.guide_lines = _wrap_guide(text, max(state.cols - 4, 20))
    state.guide_scroll = 0


def _select_item(state: TuiState, index: int) -> TuiState:
    """Enter/digit selection: switch view or record a machine action."""
    key, _ = TUI_MENU[index]
    if key == "0":
        state.quit = True
    elif key == "1":
        _open_guide(state, "proton")
    elif key == "2":
        _open_guide(state, "warp")
    elif key == "3":
        _open_guide(state, "all")
    elif key == "4":
        state.view, state.import_provider, state.import_text = "import", "proton", ""
    elif key == "5":
        state.view, state.import_provider, state.import_text = "import", "cloudflare", ""
    elif key == "6":
        state.action = ("preset",)
    elif key == "7":
        state.action = ("check",)
    elif key == "8":
        state.action = ("engine",)
    elif key == "9":
        state.action = ("bridge_install",)
    elif key == "r":
        # Read-only rendering; mutations flow through the router CLI via
        # state.action, exactly like every other TUI action.
        state.view = "routing"
        state.preset_browser = False
        state.routing_lines = _routing_lines(state.root) or ["routing modes"]
        state.routing_prompt_text = ""
    elif key == "s":
        # Preset browser: renders read-only, mutation flows through
        # state.action like routing changes.
        state.view = "routing"
        state.preset_browser = True
        try:
            names = preset_names(state.root)
            state.routing_lines = ["presets: " + (", ".join(names) if names else "(none)")]
        except OSError:
            state.routing_lines = ["presets: (unreadable)"]
        state.routing_prompt_text = ""
    return state


def apply_key(state: TuiState, key: str) -> TuiState:
    """Advance the TUI by one key event; returns a new state.

    Pure with respect to the terminal: never writes to the screen and never
    runs machine actions directly. Imports/presets/check/engine record
    ``state.action`` for the wizard loop to execute through the existing
    ``_cmd_*`` helpers, keeping business logic identical to today.
    """
    state = copy.copy(state)
    state.action = None

    if state.view == "guide":
        if key in ("q", "Q", ESC, ENTER, "\n"):
            state.view = "menu"
        elif key in (UP, "k", "K"):
            state.guide_scroll = max(0, state.guide_scroll - 1)
        elif key in (DOWN, "j", "J"):
            visible = max(1, state.rows - 5)
            max_scroll = max(0, len(state.guide_lines) - visible)
            state.guide_scroll = min(state.guide_scroll + 1, max_scroll)
        return state

    if state.view == "import":
        if key == ESC:
            state.view = "menu"
        elif key in (ENTER, "\n"):
            path = state.import_text.strip()
            state.view = "menu"
            if not path:
                state.status = "import cancelled: empty path"
                state.status_ok = False
            else:
                state.action = ("import", state.import_provider, path)
        elif key in (BACKSPACE, "\x08"):
            state.import_text = state.import_text[:-1]
        elif key and len(key) == 1 and ord(key) >= 32:
            if len(state.import_text) < max(state.cols * 4, 256):
                state.import_text += key
        return state

    if state.view == "routing":
        if key in (ESC, "q", "Q"):
            state.view = "menu"
        elif state.preset_browser:
            if key == "1":
                state.view = "routing_prompt"
                state.routing_prompt_label = _PRESET_PROMPT_LABEL
                state.routing_prompt_args = ("preset_by_name", "{TEXT}")
            elif key == "2":
                state.view = "routing_prompt"
                state.preset_step = 0
                state.preset_name = state.preset_provider = ""
                state.routing_prompt_label = _PRESET_CREATE_LABELS[0]
            return state
        elif key == "1":
            state.action = ("routing", "set", "--mode", "vpn-list")
        elif key == "2":
            if _read_routing_state(state.root).get("default_provider"):
                state.action = ("routing", "set", "--mode", "safe-list")
            else:
                state.view = "routing_prompt"
                state.routing_prompt_label = "default provider for safe-list (e.g. proton):"
                state.routing_prompt_args = ("routing", "set", "--mode", "safe-list",
                                             "--default-provider", "{TEXT}")
        elif key == "3":
            state.view = "routing_prompt"
            state.routing_prompt_label = "domain to go DIRECT (safe-list):"
            state.routing_prompt_args = ("routing", "add", "--mode", "safe-list", "--domain", "{TEXT}")
        elif key == "4":
            state.view = "routing_prompt"
            state.routing_prompt_label = "domain to remove from the DIRECT list (safe-list):"
            state.routing_prompt_args = ("routing", "remove", "--mode", "safe-list", "--domain", "{TEXT}")
        elif key == "5":
            state.view = "routing_prompt"
            state.routing_prompt_label = "domain to TUNNEL (vpn-list):"
            state.routing_prompt_args = ("routing", "add", "--mode", "vpn-list", "--domain", "{TEXT}")
        elif key == "6":
            state.view = "routing_prompt"
            state.routing_prompt_label = "domain to remove from the VPN list (vpn-list):"
            state.routing_prompt_args = ("routing", "remove", "--mode", "vpn-list", "--domain", "{TEXT}")
        elif key == "7":
            state.view = "routing_prompt"
            state.routing_prompt_label = _PRESET_PROMPT_LABEL
            state.routing_prompt_args = ("preset_by_name", "{TEXT}")
        return state

    if state.view == "routing_prompt":
        if key == ESC:
            state.view = "routing" if state.preset_browser else "menu"
            state.preset_step = 0
        elif key in (ENTER, "\n"):
            text = state.routing_prompt_text.strip()
            if state.preset_browser and state.preset_step < 2:
                # create-preset flow: name (0) -> provider (1) -> domains (2)
                if not text:
                    state.status = "preset create cancelled: empty input"
                    state.status_ok = False
                elif state.preset_step == 0:
                    state.preset_name = text
                    state.preset_step = 1
                    state.routing_prompt_label = _PRESET_CREATE_LABELS[1]
                elif state.preset_step == 1:
                    state.preset_provider = text
                    state.preset_step = 2
                    state.routing_prompt_label = _PRESET_CREATE_LABELS[2]
                state.routing_prompt_text = ""
            elif state.preset_browser and state.preset_step == 2:
                # final create-flow step: domains -> fire preset_create action
                state.view = "routing"
                state.preset_step = 0
                if not text:
                    state.status = "preset create cancelled: empty domain"
                    state.status_ok = False
                else:
                    state.action = ("preset_create", state.preset_name,
                                    state.preset_provider, text)
            else:
                state.view = "routing" if state.preset_browser else "menu"
                if not text:
                    state.status = "routing change cancelled: empty input"
                    state.status_ok = False
                else:
                    state.action = tuple(text if part == "{TEXT}" else part for part in state.routing_prompt_args)
        elif key in (BACKSPACE, "\x08"):
            state.routing_prompt_text = state.routing_prompt_text[:-1]
        elif key and len(key) == 1 and ord(key) >= 32:
            if len(state.routing_prompt_text) < max(state.cols * 4, 256):
                state.routing_prompt_text += key
        return state

    # menu view
    if key in (UP, "k", "K"):
        state.cursor = (state.cursor - 1) % len(TUI_MENU)
    elif key in (DOWN, "j", "J"):
        state.cursor = (state.cursor + 1) % len(TUI_MENU)
    elif key in ("q", "Q", ESC, "\x03", "\x04"):
        state.quit = True
    elif key in (ENTER, "\n"):
        return _select_item(state, state.cursor)
    elif key in TUI_MENU_INDEX:
        state.cursor = TUI_MENU_INDEX[key]
        return _select_item(state, state.cursor)
    return state


@contextlib.contextmanager
def _capture_output():
    """Capture parent prints and child-process fd output into one buffer."""
    buf = io.StringIO()
    saved_out = saved_err = None
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        saved_out, saved_err = os.dup(1), os.dup(2)
        with tempfile.TemporaryFile() as tmp:
            os.dup2(tmp.fileno(), 1)
            os.dup2(tmp.fileno(), 2)
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                yield buf
            tmp.seek(0)
            buf.write(tmp.read().decode("utf-8", errors="replace"))
    finally:
        if saved_out is not None:
            os.dup2(saved_out, 1)
            os.close(saved_out)
        if saved_err is not None:
            os.dup2(saved_err, 2)
            os.close(saved_err)


def _execute_action(action: tuple, root: Path) -> tuple[str, int]:
    """Run a recorded action through the existing helpers, capturing output.

    Exactly the same helpers and call shapes as the non-interactive CLI and
    the line wizard use; the screen simply stays up and the result lands in
    the status area instead of the terminal scrollback.
    """
    kind = action[0]
    with _capture_output() as buf:
        if kind == "import":
            rc = _cmd_import(root, action[1], [action[2]])
        elif kind == "preset":
            rc = _cmd_preset(root)
        elif kind == "preset_by_name":
            try:
                result = apply_preset_by_name(root, action[1])
                buf.write(f"preset '{result['preset']}' applied — routing={result['mode']}"
                          + (f"; added {', '.join(result['added'])}" if result["added"] else "; nothing to add"))
                rc = 0
            except (ValueError, json.JSONDecodeError, OSError) as exc:
                buf.write(f"preset apply failed: {exc}")
                rc = 1
        elif kind == "preset_create":
            # write the preset file only; the engine is never started here
            try:
                _, name, provider, domain_text = action
                domains = [d.strip() for d in domain_text.split(",") if d.strip()]
                path = add_custom_preset(root, name, provider, domains)
                buf.write(f"custom preset '{name}' written to {path.relative_to(root or Path('.'))} (not applied)")
                rc = 0
            except (ValueError, OSError) as exc:
                buf.write(f"preset create failed: {exc}")
                rc = 1
        elif kind == "check":
            rc = _cmd_check(root)
        elif kind == "engine":
            rc = _router_command(root, "ensure")
            if rc == 0:
                buf.write("engine up")
            else:
                buf.write("engine failed to start (see output above)")
        elif kind == "bridge_install":
            rc = _cmd_bridge_install(root)
        elif kind == "routing":
            # One writer: the `router.py routing` CLI. Never starts the engine -
            # the output tells the operator to run ensure/reload separately.
            rc = _router_command(root, "routing", *action[1:])
            if rc == 0:
                buf.write("routing config saved (engine NOT reloaded - run 'router.py ensure' to apply)")
            else:
                buf.write("routing change failed (see router output above)")
        else:  # pragma: no cover - defensive
            rc = 0
    return _strip_ansi(buf.getvalue()).strip(), rc


def _paint(state: TuiState) -> None:
    """Paint one full frame: home + lines + home, single write burst."""
    out = sys.stdout
    frame = render_frame(state)
    if len(frame) < state.rows:
        frame = frame + [""] * (state.rows - len(frame))
    out.write("\x1b[H")
    out.write("\r\n".join(frame))
    out.write("\x1b[H")
    if state.view == "import":
        row = 4  # 1-based line of the " path: " input row (frame index 3)
        col = min(1 + len(" path: ") + len(state.import_text), state.cols - 1)
        out.write(f"\x1b[{row};{col}H\x1b[?25h")
    else:
        out.write("\x1b[?25l")
    out.flush()


def _read_key(timeout: float = 0.05) -> str:
    """Read one key event from raw stdin; resolves ESC-prefixed sequences."""
    fd = sys.stdin.fileno()

    def _read1() -> str:
        try:
            data = os.read(fd, 1)
        except OSError:
            return ""
        if not data:
            return "\x04"  # EOF behaves like quit
        return data.decode("utf-8", errors="replace")

    ch = _read1()
    if ch != ESC:
        return ch
    # ESC: possibly the start of an arrow/function sequence; peek for more.
    try:
        ready, _, _ = select.select([fd], [], [], timeout)
    except (OSError, ValueError):
        ready = []
    if not ready:
        return ESC
    seq = _read1()
    if seq in ("[", "O"):
        try:
            ready, _, _ = select.select([fd], [], [], timeout)
        except (OSError, ValueError):
            ready = []
        if ready:
            seq += _read1()
    return ESC + seq


def _tui_wizard(root: Path) -> int:
    """Full-screen alternate-screen wizard (both streams must be TTYs)."""
    state = _initial_state(root)
    fd = sys.stdin.fileno()
    try:
        saved = termios.tcgetattr(fd)
    except (termios.error, OSError, ValueError):
        saved = None
    interrupted = False
    try:
        try:
            tty.setraw(fd)
        except Exception:
            return _line_wizard(root)
        sys.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J")
        sys.stdout.flush()
        while not state.quit:
            _paint(state)
            key = _read_key()
            state = apply_key(state, key)
            if state.action is not None:
                text, rc = _execute_action(state.action, root)
                state.action = None
                state.view = "menu"
                state.status = text or ("command finished" if rc == 0 else "command failed")
                state.status_ok = rc == 0
    except KeyboardInterrupt:
        interrupted = True
    finally:
        # Always restore the terminal, even on errors or Ctrl-C.
        try:
            sys.stdout.write("\x1b[?25h\x1b[?1049l\n\n")
            sys.stdout.flush()
        except Exception:
            pass
        if saved is not None:
            try:
                termios.tcsetattr(fd, termios.TCSADRAIN, saved)
            except Exception:
                pass
    return 130 if interrupted else 0


def wizard(root=None) -> int:
    """Interactive setup: full-screen TUI on a real TTY, line fallback otherwise.

    Falls back to the plain line menu when stdin or stdout is not a TTY
    (pipes, CI, tests) or when POSIX raw mode (termios/tty) is unavailable.
    """
    root = Path(root) if root is not None else ROOT
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        return _line_wizard(root)
    if not _HAVE_TERMIOS:
        return _line_wizard(root)
    return _tui_wizard(root)


def main(argv=None, root=None) -> int:
    """CLI entry point: non-interactive flags, or the wizard when run bare.

    ``root`` is the repository root to operate on (tests and the router CLI
    pass it explicitly); it redirects every path this module resolves.
    """
    global ROOT
    if root is not None:
        ROOT = Path(root).resolve()
    if argv and argv[0] == "setup":
        argv = argv[1:]

    parser = argparse.ArgumentParser(
        prog="proxy-router setup",
        description="setup wizard: guides, profile import, presets, health check",
    )
    parser.add_argument("--guide", choices=["proton", "warp", "all"], metavar="PROVIDER",
                        help="print a setup guide (proton, warp, or all)")
    parser.add_argument("--check", action="store_true",
                        help="verify router.json and provider profiles")
    parser.add_argument("--import-proton", nargs="+", metavar="PATH",
                        help="import WireGuard .conf file(s)/directory into providers/proton")
    parser.add_argument("--import-warp", nargs="+", metavar="PATH",
                        help="import WireGuard .conf file(s)/directory into providers/cloudflare")
    parser.add_argument("--preset", metavar="NAME", nargs="?",
                        const="default",
                        help="apply a preset by name (built-in or custom; bare --preset applies 'default')")
    parser.add_argument("--preset-list", action="store_true",
                        help="list available presets (built-in and custom)")
    parser.add_argument("--preset-add", metavar="NAME",
                        help="create a custom preset file under presets/")
    parser.add_argument("--provider", metavar="PROVIDER",
                        help="provider for --preset-add (e.g. proton, cloudflare)")
    parser.add_argument("--domain", action="append", default=[], metavar="DOMAIN",
                        help="domain for --preset-add (repeatable)")
    parser.add_argument("--preset-route-mode", choices=["vpn-list", "safe-list", "default"],
                        default="vpn-list",
                        help="routing mode for --preset-add (default vpn-list)")
    parser.add_argument("--preset-default-provider", metavar="PROVIDER",
                        help="default_provider for --preset-add safe-list mode")
    parser.add_argument("--bridge-install", action="store_true",
                        help="install the Hermes OpenCode auto-rotation bridge")
    parser.add_argument("--bridge-force-install", action="store_true",
                        help="install the bridge, overwriting an existing file")
    parser.add_argument("--bridge-check", action="store_true",
                        help="verify the installed OpenCode auto-rotation bridge")
    args = parser.parse_args(argv)

    rc = 0
    if args.guide:
        rc = max(rc, _cmd_guide(args.guide))
    if args.check:
        rc = max(rc, _cmd_check(ROOT))
    if args.import_proton:
        rc = max(rc, _cmd_import(ROOT, "proton", args.import_proton))
    if args.import_warp:
        rc = max(rc, _cmd_import(ROOT, "cloudflare", args.import_warp))
    if args.preset:
        try:
            result = apply_preset_by_name(ROOT, args.preset)
            label = f"setup: preset '{result['preset']}' applied — routing={result['mode']}"
            if result["added"]:
                label += f", added route(s): {', '.join(result['added'])}"
            else:
                label += " (already present, nothing added)"
            print(_style(_tint_provider(label), _Ansi.GREEN))
            print("setup: run `proxy-router ensure` (or reload) to apply; the engine is untouched.")
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            print(_style(f"setup: preset apply failed: {exc}", _Ansi.RED), file=sys.stderr)
            rc = max(rc, 1)
    if args.preset_list:
        print("setup: available presets:")
        for name in preset_names(ROOT):
            source = "built-in" if name in _BUILTIN_PRESETS else "custom"
            print(f"  {name:16s} ({source})")
    if args.preset_add:
        try:
            if not args.provider:
                raise ValueError("--preset-add needs --provider (e.g. proton, cloudflare)")
            path = add_custom_preset(ROOT, args.preset_add, args.provider, args.domain,
                                     mode=args.preset_route_mode,
                                     default_provider=args.preset_default_provider)
            print(_style(f"setup: custom preset '{args.preset_add}' written to {path}", _Ansi.GREEN))
            print("setup: apply it with `setup --preset <name>`, or from the TUI preset menu.")
        except ValueError as exc:
            print(_style(f"setup: {exc}", _Ansi.RED), file=sys.stderr)
            rc = max(rc, 1)
    if args.bridge_install:
        rc = max(rc, _cmd_bridge_install(ROOT))
    if args.bridge_force_install:
        rc = max(rc, _cmd_bridge_install(ROOT, force=True))
    if args.bridge_check:
        rc = max(rc, _cmd_bridge_check(ROOT))
    if not (args.guide or args.check or args.import_proton or args.import_warp or args.preset
            or args.bridge_install or args.bridge_force_install or args.bridge_check):
        rc = wizard(ROOT)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
