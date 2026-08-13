#!/usr/bin/env python3
"""Standalone watcher for domains observed through proxy-router.

This process is deliberately independent from Hermes. It tails sing-box's
connection log, records which routed targets are active, attributes current
localhost:2080 clients when macOS exposes them through ``lsof``, and probes a
critical routed domain after it is observed. It rotates the provider only for
persistent destination-specific transport failures.

Scope is intentionally honest: HTTP-proxy mode can observe traffic that uses
127.0.0.1:2080, not applications that bypass the proxy. Full-device coverage
requires sing-box TUN or a macOS Network Extension and is a separate mode.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable, Iterable

ROOT = Path(os.environ.get("PROXY_ROUTER_ROOT") or Path(__file__).resolve().parent).resolve()
LOG_FILE_NAME = "sing-box.log"
STATE_DIR_NAME = "state/route-watcher"
PID_NAME = "pid"
ENABLED_NAME = "enabled"
EVENTS_NAME = "events.jsonl"
DEFAULT_INTERVAL = 2.0
TARGET_IDLE_SECONDS = 60.0
PROBE_EVERY_SECONDS = 10.0
CLIENT_SNAPSHOT_EVERY_SECONDS = 5.0
FAILURE_WINDOW_SECONDS = 60.0
MIN_TRANSPORT_FAILURES = 2
ROTATE_COOLDOWN_SECONDS = 120.0
EVENT_MAX_LINES = 5000
EVENT_MAX_BYTES = 2_000_000
TARGET_RE = re.compile(
    r"(?:inbound connection to|outbound connection to|open connection to)\s+"
    r"(?P<host>[^\s:]+)(?::(?P<port>\d+))?",
    re.IGNORECASE,
)
CLIENT_RE = re.compile(r"inbound connection from\s+(?P<host>[^\s:]+)", re.IGNORECASE)
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
FAILURE_RE = re.compile(
    r"\b(?:timeout|timed out|connection refused|connection reset|unexpected eof|"
    r"tls|ssl|eof|network is unreachable|no route to host|i/o timeout)\b",
    re.IGNORECASE,
)


def state_dir(root: Path | None = None) -> Path:
    return (Path(root) if root is not None else ROOT) / STATE_DIR_NAME


def pid_file(root: Path | None = None) -> Path:
    return state_dir(root) / PID_NAME


def enabled_file(root: Path | None = None) -> Path:
    return state_dir(root) / ENABLED_NAME


def events_file(root: Path | None = None) -> Path:
    return state_dir(root) / EVENTS_NAME


def normalize_host(host: str) -> str:
    return host.rstrip(".").lower().strip("[]")


def domain_matches(host: str, domain: str) -> bool:
    host = normalize_host(host)
    domain = normalize_host(domain)
    return host == domain or host.endswith("." + domain)


def parse_line(line: str) -> dict | None:
    """Parse a sing-box connection line without retaining ANSI decoration."""
    clean = ANSI_RE.sub("", line).strip()
    target = TARGET_RE.search(clean)
    if target:
        return {
            "kind": "target",
            "host": normalize_host(target.group("host")),
            "port": int(target.group("port") or 443),
            "failure": bool("open connection to" in clean.lower() and FAILURE_RE.search(clean)),
            "line": clean[-400:],
        }
    client = CLIENT_RE.search(clean)
    if client:
        return {"kind": "client", "source": client.group("host"), "line": clean[-300:]}
    return None


def critical_domains(root: Path) -> tuple[str, ...]:
    """Read target domains from routes; opencode.ai is the default critical lane."""
    domains: list[str] = []
    try:
        config = json.loads((Path(root) / "router.json").read_text())
        for route in config.get("routes", []):
            route_id = str(route.get("id", "")).lower()
            for domain in route.get("domains", []):
                domain = normalize_host(str(domain))
                if domain and ("opencode" in route_id or domain_matches(domain, "opencode.ai")):
                    domains.append(domain)
    except (OSError, ValueError, TypeError):
        pass
    return tuple(dict.fromkeys(domains or ["opencode.ai"]))


def _owned_pid(root: Path) -> int | None:
    try:
        return int((Path(root) / "sing-box.pid").read_text().strip())
    except (OSError, ValueError):
        return None


def client_snapshot(root: Path, runner: Callable = subprocess.run) -> list[dict]:
    """Return current processes with sockets attached to the local proxy.

    ``lsof -F`` is macOS-native and keeps this dependency-free. Command names
    only are persisted; command lines may contain secrets and are never saved.
    """
    if sys.platform != "darwin":
        return []
    try:
        result = runner(
            ["lsof", "-nP", "-a", "-iTCP:2080", "-F", "pcn"],
            capture_output=True, text=True, timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    owned = _owned_pid(root)
    records: list[dict] = []
    current: dict | None = None
    for line in result.stdout.splitlines():
        if line.startswith("p"):
            if current and current.get("pid") != owned:
                records.append(current)
            try:
                current = {"pid": int(line[1:]), "command": "", "connections": []}
            except ValueError:
                current = None
        elif current is not None and line.startswith("c"):
            current["command"] = line[1:]
        elif current is not None and line.startswith("n"):
            current["connections"].append(line[1:])
    if current and current.get("pid") != owned:
        records.append(current)
    return records


def _rotate_events(path: Path) -> None:
    try:
        if path.stat().st_size < EVENT_MAX_BYTES:
            return
        archive = Path(str(path) + ".1")
        archive.unlink(missing_ok=True)
        path.rename(archive)
    except OSError:
        pass


def append_event(root: Path, event: dict) -> None:
    path = events_file(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    _rotate_events(path)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, separators=(",", ":")) + "\n")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass



class RotationGuard:
    """Persistent-failure guard used by the standalone worker."""

    def __init__(self) -> None:
        self.failure_times: collections.deque[float] = collections.deque()
        self.last_rotate = 0.0

    def record_transport_failure(self, now: float) -> bool:
        while self.failure_times and now - self.failure_times[0] > FAILURE_WINDOW_SECONDS:
            self.failure_times.popleft()
        self.failure_times.append(now)
        if len(self.failure_times) < MIN_TRANSPORT_FAILURES:
            return False
        if self.last_rotate and now - self.last_rotate < ROTATE_COOLDOWN_SECONDS:
            self.failure_times.clear()
            return False
        self.last_rotate = now
        self.failure_times.clear()
        return True


def probe_target(root: Path, host: str, *, runner: Callable = subprocess.run) -> dict:
    """Probe the exact routed target through the local proxy.

    HTTP responses prove the route reached the destination, even 401/429/5xx.
    A curl transport failure (exit code != 0) is the signal used for rotation;
    upstream HTTP errors are recorded but do not cause blind exit churn.
    """
    url = f"https://{host}/zen/v1/models" if domain_matches(host, "opencode.ai") else f"https://{host}/"
    try:
        result = runner(
            ["curl", "--proxy", "http://127.0.0.1:2080", "--noproxy", "",
             "--silent", "--show-error", "--output", "/dev/null",
             "--write-out", "%{http_code}", "--connect-timeout", "4",
             "--max-time", "8", url],
            capture_output=True, text=True, timeout=10,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "transport_failure": True, "error": "curl timeout", "host": host}
    except OSError as exc:
        return {"ok": False, "transport_failure": True, "error": type(exc).__name__, "host": host}
    code = (result.stdout or "").strip()
    if result.returncode != 0:
        return {"ok": False, "transport_failure": True, "error": (result.stderr or "curl failed")[-200:], "host": host}
    try:
        status = int(code)
    except ValueError:
        status = 0
    return {
        "ok": 100 <= status < 600,
        "transport_failure": False,
        "status": status,
        "blocked": status in {403, 1010},
        "host": host,
    }


def rotate_provider(root: Path, provider: str = "proton", *, runner: Callable = subprocess.run) -> dict:
    """Ask proxy-router itself to rotate; Hermes is not involved."""
    try:
        result = runner(
            [sys.executable, str(Path(root) / "router.py"), "rotate", provider,
             "--reason", "timeout"],
            cwd=str(root), capture_output=True, text=True, timeout=50,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"rotated": False, "error": type(exc).__name__}
    return {"rotated": result.returncode == 0, "returncode": result.returncode,
            "output": (result.stderr or result.stdout or "")[-300:]}


def _read_new_lines(path: Path, offset: int) -> tuple[int, list[str]]:
    try:
        size = path.stat().st_size
        if size < offset:
            offset = 0
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            handle.seek(offset)
            lines = handle.readlines()
            return handle.tell(), lines
    except OSError:
        return offset, []


def worker(root: Path, interval: float = DEFAULT_INTERVAL, *, sleep: Callable = time.sleep) -> int:
    root = Path(root).resolve()
    state_dir(root).mkdir(parents=True, exist_ok=True)
    pid_file(root).write_text(str(os.getpid()), encoding="ascii")
    enabled_file(root).write_text("enabled\n", encoding="ascii")
    os.chmod(pid_file(root), 0o600)
    os.chmod(enabled_file(root), 0o600)
    log_path = root / LOG_FILE_NAME
    offset = log_path.stat().st_size if log_path.exists() else 0
    domains = critical_domains(root)
    last_target: dict[str, float] = {}
    last_probe: dict[str, float] = {}
    clients: list[dict] = []
    clients_at = 0.0
    guard = RotationGuard()
    try:
        while enabled_file(root).is_file():
            offset, lines = _read_new_lines(log_path, offset)
            for line in lines:
                event = parse_line(line)
                if not event:
                    continue
                now = time.monotonic()
                host = event.get("host", "")
                if event["kind"] == "target":
                    is_critical = any(domain_matches(host, d) for d in domains)
                    if now - clients_at >= CLIENT_SNAPSHOT_EVERY_SECONDS:
                        clients = client_snapshot(root)
                        clients_at = now
                    event.update({
                        "critical": is_critical,
                        "observed_at": time.time(),
                        "clients": clients,
                    })
                    append_event(root, event)
                    if is_critical:
                        last_target[host] = now
                        if event.get("failure") and guard.record_transport_failure(now):
                            result = rotate_provider(root)
                            append_event(root, {"kind": "rotation", "observed_at": time.time(), **result})
                elif event["kind"] == "client":
                    # Client lines are retained only as a bounded observation;
                    # exact app attribution is captured on target events.
                    append_event(root, {**event, "observed_at": time.time()})
            now = time.monotonic()
            for host, seen_at in list(last_target.items()):
                if now - seen_at > TARGET_IDLE_SECONDS or now - last_probe.get(host, 0) < PROBE_EVERY_SECONDS:
                    continue
                last_probe[host] = now
                result = probe_target(root, host)
                append_event(root, {"kind": "probe", "observed_at": time.time(), **result})
                if result.get("transport_failure") and guard.record_transport_failure(now):
                    rotation = rotate_provider(root)
                    append_event(root, {"kind": "rotation", "observed_at": time.time(), **rotation})
            sleep(max(0.5, float(interval)))
    finally:
        pid_file(root).unlink(missing_ok=True)
        enabled_file(root).unlink(missing_ok=True)
    return 0


def _pid_matches(root: Path, pid: int) -> bool:
    """Reject recycled/foreign PIDs before status or stop signals them."""
    try:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    command = result.stdout.strip()
    return "--worker" in command and str(Path(root).resolve()) in command and Path(__file__).resolve().name in command


def _pid_running(pid: int, root: Path | None = None) -> bool:
    root = Path(root) if root is not None else ROOT
    if not _pid_matches(root, pid):
        return False
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def status(root: Path | None = None) -> dict:
    root = Path(root) if root is not None else ROOT
    try:
        pid = int(pid_file(root).read_text().strip())
    except (OSError, ValueError):
        pid = None
    return {"enabled": enabled_file(root).is_file(), "running": bool(pid and _pid_running(pid, root)), "pid": pid,
            "events": events_file(root).is_file(), "scope": "proxy-observable only", "targets": list(critical_domains(root))}


def start(root: Path | None = None, *, interval: float = DEFAULT_INTERVAL) -> dict:
    root = Path(root) if root is not None else ROOT
    current = status(root)
    if current["running"]:
        return {"started": False, "already_running": True, "pid": current["pid"]}
    state_dir(root).mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(Path(__file__).resolve()), "--worker", "--root", str(root), "--interval", str(interval)]
    try:
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as exc:
        return {"started": False, "error": f"{type(exc).__name__}: {exc}"}
    pid_file(root).write_text(str(proc.pid), encoding="ascii")
    enabled_file(root).write_text("enabled\n", encoding="ascii")
    os.chmod(pid_file(root), 0o600)
    os.chmod(enabled_file(root), 0o600)
    return {"started": True, "pid": proc.pid, "interval": interval}


def stop(root: Path | None = None) -> dict:
    root = Path(root) if root is not None else ROOT
    try:
        pid = int(pid_file(root).read_text().strip())
    except (OSError, ValueError):
        pid = None
    if pid and _pid_running(pid, root):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    pid_file(root).unlink(missing_ok=True)
    enabled_file(root).unlink(missing_ok=True)
    return {"stopped": True, "pid": pid}


def main(argv: Iterable[str] | None = None, root: Path | None = None) -> int:
    global ROOT
    if root is not None:
        ROOT = Path(root).resolve()
    parser = argparse.ArgumentParser(prog="proxy-router watcher")
    parser.add_argument("action", nargs="?", choices=["status", "on", "off", "logs"])
    parser.add_argument("--root", default=None)
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL)
    parser.add_argument("--lines", type=int, default=20)
    parser.add_argument("--worker", action="store_true")
    argv = list(argv) if argv is not None else sys.argv[1:]
    if argv and argv[0] == "watcher":
        argv = argv[1:]
    args = parser.parse_args(argv)
    root = Path(args.root).resolve() if args.root else ROOT
    if args.worker:
        return worker(root, args.interval)
    if args.action in (None, "status"):
        print(json.dumps(status(root), indent=2, sort_keys=True))
        return 0
    if args.action == "on":
        print(json.dumps(start(root, interval=args.interval), indent=2, sort_keys=True))
        return 0
    if args.action == "off":
        print(json.dumps(stop(root), indent=2, sort_keys=True))
        return 0
    path = events_file(root)
    if path.is_file():
        try:
            with path.open(encoding="utf-8") as handle:
                print("".join(collections.deque(handle, maxlen=max(1, min(args.lines, 100)))))
        except OSError:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
