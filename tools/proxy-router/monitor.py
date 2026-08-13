#!/usr/bin/env python3
"""Opt-in network monitor for proxy-router.

The monitor is deliberately separate from the routing engine. Nothing here runs
unless the user invokes ``monitor check`` or starts the detached worker with
``monitor on``. Samples are bounded JSONL records under ``state/monitor``.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import platform
import re
import signal
import shlex
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(os.environ.get("PROXY_ROUTER_ROOT") or Path(__file__).resolve().parent).resolve()
DEFAULT_INTERVAL = 60
DEFAULT_HTTP_URL = "https://www.cloudflare.com/cdn-cgi/trace"
DEFAULT_DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=1000000"
DEFAULT_UPLOAD_URL = "https://speed.cloudflare.com/__up"
DEFAULT_PING_HOSTS = ("1.1.1.1", "8.8.8.8")
DEFAULT_MAX_BYTES = 1_000_000
DEFAULT_TIMEOUT = 10
MAX_LOG_LINES = 100
# Rotate the samples file once it grows past either bound (F11): the worker
# appends a line every interval, so without a cap samples.jsonl grows forever.
MAX_SAMPLE_LINES = 10_000
MAX_SAMPLE_BYTES = 5_000_000
DEFAULT_HEADERS = {
    "User-Agent": "proxy-router-monitor/1.0",
    "Accept": "*/*",
}


def _open(opener, url: str, timeout: float):
    """Use browser-like headers for real urllib; leave injected test openers simple."""
    if opener is urllib.request.urlopen:
        return opener(urllib.request.Request(url, headers=DEFAULT_HEADERS), timeout=timeout)
    return opener(url, timeout=timeout)


def monitor_dir(root: Path | None = None) -> Path:
    return (Path(root) if root is not None else ROOT) / "state" / "monitor"


def pid_file(root: Path | None = None) -> Path:
    return monitor_dir(root) / "pid"


def enabled_file(root: Path | None = None) -> Path:
    return monitor_dir(root) / "enabled"


def samples_file(root: Path | None = None) -> Path:
    return monitor_dir(root) / "samples.jsonl"


def _error(message: str, **extra) -> dict:
    result = {"error": message}
    result.update(extra)
    return result


def _network_error(exc: Exception, url: str, **extra) -> dict:
    """Keep exception details useful without persisting a credential-bearing URL."""
    url_text = str(url)
    message = str(exc).replace(url_text, "[REDACTED_URL]")
    message = re.sub(r"https?://[^\s'\"]+", "[REDACTED_URL]", message)
    return _error(f"{type(exc).__name__}: {message}", **extra)


def _close(response) -> None:
    close = getattr(response, "close", None)
    if callable(close):
        close()


def parse_ping_output(text: str) -> dict:
    """Parse macOS/Linux or Windows ping output without assuming locale details."""
    match = re.search(
        r"(?:min/avg/max/(?:stddev|mdev)|Minimum\s*=)\s*=?\s*"
        r"([0-9.]+)[/\s]+([0-9.]+)[/\s]+([0-9.]+)",
        text,
        re.IGNORECASE,
    )
    if match:
        return {
            "min_ms": float(match.group(1)),
            "avg_ms": float(match.group(2)),
            "max_ms": float(match.group(3)),
        }
    windows = re.search(
        r"Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms",
        text,
        re.IGNORECASE,
    )
    if windows:
        return {
            "min_ms": float(windows.group(1)),
            "avg_ms": float(windows.group(3)),
            "max_ms": float(windows.group(2)),
        }
    return {"min_ms": None, "avg_ms": None, "max_ms": None, "error": "ping result unavailable"}


def _safe_target(url: str) -> str:
    try:
        parsed = urlsplit(str(url))
        return parsed.hostname or "configured-target"
    except (TypeError, ValueError):
        return "configured-target"


def measure_http_latency(url: str = DEFAULT_HTTP_URL, *, opener=urllib.request.urlopen,
                         clock=time.monotonic, timeout: float = 5) -> dict:
    started = clock()
    response = None
    try:
        response = _open(opener, url, timeout)
        response.read(1)
        result = {
            "target": _safe_target(url),
            "status": int(getattr(response, "status", getattr(response, "code", 200))),
            "latency_ms": round((clock() - started) * 1000, 2),
        }
        return result
    except Exception as exc:  # network errors are data, not monitor crashes
        return _network_error(exc, url, target=_safe_target(url))
    finally:
        if response is not None:
            _close(response)


def _throughput(bytes_read: int, elapsed: float) -> float | None:
    if elapsed <= 0:
        return None
    return round(bytes_read * 8 / elapsed / 1_000_000, 3)


def measure_download(url: str = DEFAULT_DOWNLOAD_URL, *, max_bytes: int = DEFAULT_MAX_BYTES,
                     opener=urllib.request.urlopen, clock=time.monotonic,
                     timeout: float = DEFAULT_TIMEOUT) -> dict:
    max_bytes = max(1, int(max_bytes))
    started = clock()
    response = None
    total = 0
    try:
        response = _open(opener, url, timeout)
        while total < max_bytes:
            chunk = response.read(min(64 * 1024, max_bytes - total))
            if not chunk:
                break
            total += len(chunk)
        elapsed = clock() - started
        return {"bytes": total, "mbps": _throughput(total, elapsed)}
    except Exception as exc:
        return _network_error(exc, url, bytes=total)
    finally:
        if response is not None:
            _close(response)


def measure_upload(url: str = DEFAULT_UPLOAD_URL, *, max_bytes: int = DEFAULT_MAX_BYTES,
                   opener=urllib.request.urlopen, clock=time.monotonic,
                   timeout: float = DEFAULT_TIMEOUT) -> dict:
    max_bytes = max(1, int(max_bytes))
    payload = b"0" * max_bytes
    started = clock()
    response = None
    try:
        request = urllib.request.Request(url, data=payload, headers=DEFAULT_HEADERS, method="POST")
        response = opener(request, timeout=timeout)
        response.read(1)
        elapsed = clock() - started
        return {"bytes": max_bytes, "mbps": _throughput(max_bytes, elapsed),
                "status": int(getattr(response, "status", getattr(response, "code", 200)))}
    except Exception as exc:
        return _network_error(exc, url, bytes=max_bytes)
    finally:
        if response is not None:
            _close(response)


def measure_ping(host: str, *, command_runner=subprocess.run,
                 system: str | None = None, timeout: float = 8) -> dict:
    system = system or platform.system()
    if system == "Windows":
        command = ["ping", "-n", "3", "-w", "2000", host]
    elif system == "Darwin":
        # macOS: -W is in milliseconds.
        command = ["ping", "-c", "3", "-W", "2000", host]
    else:
        # Linux: -W is in SECONDS; 2000 would be an ~33-minute dead wait (F9).
        command = ["ping", "-c", "3", "-W", "2", host]
    try:
        result = command_runner(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return _error("ping command unavailable", host=host)
    except Exception as exc:
        return _error(f"{type(exc).__name__}: {exc}", host=host)
    parsed = parse_ping_output((result.stdout or "") + "\n" + (result.stderr or ""))
    parsed["host"] = host
    if getattr(result, "returncode", 0) != 0 and parsed.get("avg_ms") is None:
        parsed.setdefault("error", "ping failed")
    return parsed


def _monitor_settings(root: Path) -> dict:
    settings = {
        "interval_seconds": DEFAULT_INTERVAL,
        "http_url": DEFAULT_HTTP_URL,
        "download_url": DEFAULT_DOWNLOAD_URL,
        "upload_url": DEFAULT_UPLOAD_URL,
        "ping_hosts": list(DEFAULT_PING_HOSTS),
        "max_bytes": DEFAULT_MAX_BYTES,
        "timeout_seconds": DEFAULT_TIMEOUT,
    }
    config = root / "router.json"
    try:
        data = json.loads(config.read_text())
        custom = data.get("monitor", {}) if isinstance(data, dict) else {}
        if isinstance(custom, dict):
            for key in settings:
                if key in custom:
                    settings[key] = custom[key]
    except (OSError, json.JSONDecodeError):
        pass
    for key in ("http_url", "download_url", "upload_url"):
        value = settings[key]
        try:
            parsed = urlsplit(value) if isinstance(value, str) else None
        except ValueError:
            parsed = None
        if parsed is None or parsed.scheme not in {"http", "https"} or not parsed.hostname:
            settings[key] = {
                "http_url": DEFAULT_HTTP_URL,
                "download_url": DEFAULT_DOWNLOAD_URL,
                "upload_url": DEFAULT_UPLOAD_URL,
            }[key]
    try:
        settings["interval_seconds"] = max(5, int(settings["interval_seconds"]))
    except (TypeError, ValueError):
        settings["interval_seconds"] = DEFAULT_INTERVAL
    try:
        settings["max_bytes"] = min(max(1, int(settings["max_bytes"])), 10_000_000)
    except (TypeError, ValueError):
        settings["max_bytes"] = DEFAULT_MAX_BYTES
    try:
        settings["timeout_seconds"] = min(max(1, float(settings["timeout_seconds"])), 60)
    except (TypeError, ValueError):
        settings["timeout_seconds"] = DEFAULT_TIMEOUT
    hosts = settings["ping_hosts"]
    if not isinstance(hosts, (list, tuple)):
        hosts = DEFAULT_PING_HOSTS
    settings["ping_hosts"] = [str(x) for x in hosts if str(x)][:8]
    return settings


def collect_sample(root: Path | None = None, *, opener=urllib.request.urlopen,
                   command_runner=subprocess.run, clock=time.monotonic,
                   include_speed: bool = True) -> dict:
    """Collect one bounded sample; this function is only called by check/worker."""
    root = Path(root) if root is not None else ROOT
    settings = _monitor_settings(root)
    sample = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "http": measure_http_latency(settings["http_url"], opener=opener, clock=clock,
                                      timeout=settings["timeout_seconds"]),
        "ping": [measure_ping(host, command_runner=command_runner) for host in settings["ping_hosts"]],
    }
    if include_speed:
        sample["download"] = measure_download(
            settings["download_url"], max_bytes=settings["max_bytes"], opener=opener,
            clock=clock, timeout=settings["timeout_seconds"],
        )
        sample["upload"] = measure_upload(
            settings["upload_url"], max_bytes=settings["max_bytes"], opener=opener,
            clock=clock, timeout=settings["timeout_seconds"],
        )
    return sample


def _pid_matches(pid: int, root: Path) -> bool:
    """Confirm a PID belongs to this monitor worker before trusting/killing it."""
    if pid <= 0:
        return False
    root = Path(root).resolve()
    try:
        if os.name == "nt":
            command = [
                "powershell", "-NoProfile", "-Command",
                f"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\").CommandLine",
            ]
        else:
            command = ["ps", "-p", str(pid), "-o", "command="]
        result = subprocess.run(command, capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        return False
    command_line = result.stdout or ""
    try:
        tokens = shlex.split(command_line)
    except ValueError:
        tokens = command_line.split()
    script_ok = any(Path(token).name == "monitor.py" for token in tokens)
    root_arg = None
    if "--root" in tokens:
        index = tokens.index("--root")
        if index + 1 < len(tokens):
            root_arg = tokens[index + 1]
    return (
        result.returncode == 0
        and script_ok
        and "--worker" in tokens
        and root_arg == str(root)
    )


def _pid_running(pid: int, root: Path | None = None) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return root is None or _pid_matches(pid, Path(root))



def _read_pid(root: Path) -> int | None:
    try:
        return int(pid_file(root).read_text().strip())
    except (OSError, ValueError):
        return None


def status(root: Path | None = None, *, pid_checker=None) -> dict:
    """Read state only; never performs network probes."""
    root = Path(root) if root is not None else ROOT
    pid = _read_pid(root)
    if pid_checker is None:
        running = bool(pid and _pid_running(pid, root))
    else:
        running = bool(pid and pid_checker(pid))
    return {
        "enabled": enabled_file(root).is_file(),
        "running": running,
        "pid": pid,
        "samples": samples_file(root).is_file(),
    }


def worker_command(root: Path, interval: int) -> list[str]:
    return [sys.executable, str(Path(__file__).resolve()), "--worker", "--root", str(root),
            "--interval", str(int(interval))]


def start(root: Path | None = None, *, interval: int | None = None) -> dict:
    root = Path(root) if root is not None else ROOT
    current = status(root)
    if current["running"]:
        return {"started": False, "already_running": True, "pid": current["pid"]}
    interval = max(5, int(interval or _monitor_settings(root)["interval_seconds"]))
    directory = monitor_dir(root)
    directory.mkdir(parents=True, exist_ok=True)
    command = worker_command(root, interval)
    try:
        proc = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, start_new_session=True,
        )
    except OSError as exc:
        return {"started": False, "error": f"could not start monitor: {exc}"}
    pid_file(root).write_text(str(proc.pid))
    enabled_file(root).write_text("enabled\n")
    os.chmod(pid_file(root), 0o600)
    os.chmod(enabled_file(root), 0o600)
    return {"started": True, "pid": proc.pid, "interval_seconds": interval}


def stop(root: Path | None = None) -> dict:
    root = Path(root) if root is not None else ROOT
    pid = _read_pid(root)
    if pid and _pid_running(pid, root):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    pid_file(root).unlink(missing_ok=True)
    enabled_file(root).unlink(missing_ok=True)
    return {"stopped": True, "pid": pid}


def _rotate_samples_if_needed(path: Path) -> None:
    """Archive a too-large/too-long samples file to ``samples.jsonl.1``."""
    try:
        size = path.stat().st_size
        with path.open() as handle:
            lines = sum(1 for _ in handle)
    except OSError:
        return
    if size < MAX_SAMPLE_BYTES and lines < MAX_SAMPLE_LINES:
        return
    archive = path.with_suffix(path.suffix + ".1")
    archive.unlink(missing_ok=True)
    try:
        path.rename(archive)
    except OSError:
        pass


def append_sample(root: Path, sample: dict) -> None:
    path = samples_file(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    _rotate_samples_if_needed(path)
    with path.open("a") as handle:
        handle.write(json.dumps(sample, separators=(",", ":")) + "\n")
    os.chmod(path, 0o600)


def worker(root: Path, interval: int) -> int:
    """Worker entrypoint. It exits naturally when monitor off removes enabled."""
    root = Path(root)
    enabled_file(root).parent.mkdir(parents=True, exist_ok=True)
    enabled_file(root).touch(mode=0o600, exist_ok=True)
    while enabled_file(root).is_file():
        try:
            append_sample(root, collect_sample(root))
        except Exception as exc:  # keep the worker alive but record no secrets
            append_sample(root, {"timestamp": datetime.now(timezone.utc).isoformat(),
                                 "error": f"{type(exc).__name__}: {exc}"})
        time.sleep(max(5, int(interval)))
    return 0


def tail_logs(root: Path | None = None, *, lines: int = 20) -> str:
    path = samples_file(Path(root) if root is not None else ROOT)
    if not path.is_file():
        return ""
    lines = min(max(1, int(lines)), MAX_LOG_LINES)
    with path.open() as handle:
        return "".join(collections.deque(handle, maxlen=lines))


def _print_json(data: dict) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def main(argv=None, root=None) -> int:
    global ROOT
    if root is not None:
        ROOT = Path(root).resolve()
    argv = list(argv or sys.argv[1:])
    if argv and argv[0] == "monitor":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="proxy-router monitor")
    parser.add_argument("action", nargs="?", choices=["check", "on", "off", "status", "logs"])
    parser.add_argument("--root", default=None)
    parser.add_argument("--interval", type=int, default=None)
    parser.add_argument("--lines", type=int, default=20)
    parser.add_argument("--worker", action="store_true")
    args = parser.parse_args(argv)
    target = Path(args.root).resolve() if args.root else ROOT
    if args.worker:
        return worker(target, args.interval or _monitor_settings(target)["interval_seconds"])
    if args.action == "check":
        _print_json(collect_sample(target))
        return 0
    if args.action == "on":
        _print_json(start(target, interval=args.interval))
        return 0
    if args.action == "off":
        _print_json(stop(target))
        return 0
    if args.action == "status":
        _print_json(status(target))
        return 0
    if args.action == "logs":
        text = tail_logs(target, lines=args.lines)
        print(text, end="" if text.endswith("\n") or not text else "\n")
        return 0
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
