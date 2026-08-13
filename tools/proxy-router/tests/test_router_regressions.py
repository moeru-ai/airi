from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_router(tmp_path):
    sys.path.insert(0, str(ROOT))
    spec = importlib.util.spec_from_file_location("proxy_router_under_test", ROOT / "router.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    module.CONFIG_FILE = tmp_path / "router.json"
    module.SING_BOX_CONFIG = tmp_path / "sing-box.json"
    module.LAST_GOOD_FILE = tmp_path / "sing-box.json.last-good"
    module.PID_FILE = tmp_path / "sing-box.pid"
    module.LOG_FILE = tmp_path / "sing-box.log"
    module.LOCK_FILE = tmp_path / "state" / "engine.lock"
    module.MODE_FILE = tmp_path / "state" / "mode"
    return module


def test_vpn_list_filters_provider_routes_to_vpn_domains(tmp_path):
    router = load_router(tmp_path)
    profile = tmp_path / "proton.conf"
    router._providers = {"proton": {}}
    router._routes = [{
        "id": "mixed",
        "provider": "proton",
        "domains": ["blocked.example", "ordinary.example"],
    }]
    router._routing = {"mode": "vpn-list", "vpn_domains": ["blocked.example"]}
    router._port = 2080
    router.current_mode = lambda: "proxy"
    router._usable_profile = lambda name, preferred=None: profile
    router.parse_wireguard = lambda path: {
        "type": "wireguard", "tag": "", "address": ["10.0.0.2/32"],
        "private_key": "secret", "peers": [{"address": "192.0.2.1", "port": 1,
        "public_key": "public", "allowed_ips": ["0.0.0.0/0"]}],
    }
    router.dns_server_for = lambda path: "1.1.1.1"

    config, _active = router.build_singbox_config()

    provider_rules = [r for r in config["route"]["rules"] if r.get("outbound") == "proton"]
    assert provider_rules == [{"outbound": "proton", "domain_suffix": ["blocked.example"]}]
    assert config["route"]["final"] == "direct"


def test_selective_tun_uses_address_set_and_keeps_auto_route(tmp_path):
    router = load_router(tmp_path)
    rulesets = tmp_path / "rulesets"
    rulesets.mkdir()
    (rulesets / "roblox.json").write_text(json.dumps({
        "provider": "cloudflare",
        "ip_cidr": ["128.116.0.0/17", "2620:135:6000::/40"],
    }))
    profile = tmp_path / "cloudflare.conf"
    router._providers = {"cloudflare": {}}
    router._routes = []
    router._vpn = {"selective": "roblox", "selective_provider": "cloudflare"}
    router._routing = {}
    router._port = 2080
    router.current_mode = lambda: "tun"
    router._usable_profile = lambda name, preferred=None: profile
    router.parse_wireguard = lambda path: {
        "type": "wireguard", "tag": "", "address": ["10.0.0.2/32"],
        "private_key": "secret", "peers": [{"address": "192.0.2.1", "port": 1,
        "public_key": "public", "allowed_ips": ["0.0.0.0/0"]}],
    }
    router.dns_server_for = lambda path: "1.1.1.1"

    config, _active = router.build_singbox_config()
    tun = config["inbounds"][0]

    assert tun["auto_route"] is True
    assert tun["route_address_set"] == ["ruleset-roblox"]
    assert config["route"]["rule_set"] == [{
        "type": "inline", "tag": "ruleset-roblox",
        "rules": [{"ip_cidr": ["128.116.0.0/17", "2620:135:6000::/40"]}],
    }]
    assert config["route"]["rules"][1] == {
        "rule_set": ["ruleset-roblox"], "outbound": "cloudflare",
    }


def test_configured_profile_matches_live_endpoint_without_using_marker(tmp_path):
    router = load_router(tmp_path)
    provider_dir = tmp_path / "providers" / "proton"
    provider_dir.mkdir(parents=True)
    profile = provider_dir / "01-NL-FREE-140.conf"
    profile.write_text("[Interface]\nAddress = 10.0.0.2/32\nPrivateKey = secret\n\n[Peer]\nEndpoint = 192.0.2.55:51820\nPublicKey = public\nAllowedIPs = 0.0.0.0/0\n")
    router._providers = {"proton": {"directory": "providers/proton"}}
    router.SING_BOX_CONFIG.write_text(json.dumps({"endpoints": [{
        "type": "wireguard", "tag": "proton", "address": ["10.0.0.2/32"],
        "private_key": "secret", "peers": [{"address": "192.0.2.55", "port": 51820,
        "public_key": "public", "allowed_ips": ["0.0.0.0/0"]}],
        "domain_resolver": "dns-proton",
    }]}))
    (tmp_path / "state").mkdir()
    (tmp_path / "state" / "proton.active").write_text("00-US-FREE-108")

    assert router.configured_profile("proton") == profile


def test_rotate_to_current_profile_is_noop_does_not_cooldown(tmp_path, monkeypatch):
    """Re-selecting the already-active exit must succeed and must NOT mark
    the current profile cooling; the old code cooled it then refused the
    pick with a nonsense 'exit is cooling down' error."""
    router = load_router(tmp_path)
    provider_dir = tmp_path / "providers" / "proton"
    provider_dir.mkdir(parents=True)
    profile = provider_dir / "00-US-FREE-108.conf"
    profile.write_text("[Interface]\nAddress = 10.0.0.2/32\nPrivateKey = secret\n\n[Peer]\nEndpoint = 192.0.2.55:51820\nPublicKey = public\nAllowedIPs = 0.0.0.0/0\n")
    router._providers = {"proton": {"directory": "providers/proton", "cooldown_seconds": 60}}
    router.persisted_active = lambda name: profile
    router.is_cooled_down = lambda name, p: False
    marked = {}
    router.mark_cooldown = lambda name, p, seconds: marked.setdefault(name, p)
    router.egress_is_blocked = lambda name, p: False
    router.engine_reload = lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not reload"))
    router.set_active = lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not set_active"))
    router.record_rotation = lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not record_rotation"))

    rc = router.rotate("proton", to="00-US-FREE-108")

    assert rc == 0
    assert "proton" not in marked


# ---------------------------------------------------------------------------
# tray UX regressions (examples/proxy_tray.py)
# ---------------------------------------------------------------------------

import types  # noqa: E402


def load_tray(tmp_path):
    """Load the tray module with deterministic pystray/PIL stubs.

    Stubs are injected into ``sys.modules`` BEFORE the module body runs, so
    ``import pystray`` inside the tray resolves to the stub regardless of
    whether a real pystray is installed in the test interpreter. The stub
    mirrors pystray's Menu-as-second-argument-is-a-submenu behaviour.
    """
    stub_pystray = types.ModuleType("pystray")

    class _StubMenu:
        SEPARATOR = None

        def __init__(self, *items):
            self.items = items
            self._items = items

    class _StubMenuItem:
        def __init__(self, text, action=None, enabled=True, checked=None, submenu=None):
            if isinstance(action, _StubMenu):
                submenu, action = action, None
            self.text = text
            self.action = action
            self.enabled = enabled
            self._checked = checked
            self._submenu = submenu

        @property
        def submenu(self):
            if callable(self._submenu) and not isinstance(self._submenu, _StubMenu):
                return self._submenu()
            return self._submenu

        def is_checked(self):
            return bool(self._checked and self._checked(_StubMenuItem("probe")))

    stub_pystray.Menu = _StubMenu
    stub_pystray.MenuItem = _StubMenuItem

    stub_pil = types.ModuleType("PIL")
    stub_pil.Image = object
    stub_pil.ImageDraw = object

    saved = {}
    for name in ("pystray", "PIL"):
        saved[name] = sys.modules.get(name)
        sys.modules[name] = {"pystray": stub_pystray, "PIL": stub_pil}[name]
    try:
        spec = importlib.util.spec_from_file_location(
            "proxy_tray_under_test", ROOT / "examples" / "proxy_tray.py")
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        # Register before exec: the module uses `from __future__ import
        # annotations`, and dataclasses resolves the string annotations via
        # sys.modules[cls.__module__] — an unregistered module crashes there.
        sys.modules["proxy_tray_under_test"] = module
        spec.loader.exec_module(module)
        return module
    finally:
        for name in ("pystray", "PIL"):
            if saved[name] is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = saved[name]


def _tray_app(module, root, *, up=False, providers=None, preset=None, error=None,
              routing="default", action=None, mode="proxy"):
    client = module.RouterClient(str(root))
    app = module.TrayApp.__new__(module.TrayApp)
    app.client = client
    app.latest = module.RouterStatus(
        up=up, mode=mode, providers=providers or {}, routing_mode=routing,
        preset=preset, error=error, active_providers={})
    app.last_action_result = action
    app.lock = __import__("threading").Lock()
    app.tray = None
    return app


def _flatten(menu_items, depth=0):
    """Flatten a stub menu tree into (depth, text, enabled, checked) tuples."""
    out = []
    for item in menu_items:
        if item is None:
            out.append((depth, "---", True, False))
            continue
        sub = item.submenu
        out.append((depth, item.text, item.enabled, item.is_checked() if sub is None else False))
        if sub:
            out.extend(_flatten(sub.items, depth + 1))
    return out


def test_tray_down_status_is_disconnected_not_error(tmp_path):
    """ROOT CAUSE: `RouterStatus.from_cli` short-circuited on rc != 0, so a
    plain disconnect (status --json exits 1 with a valid payload) rendered as
    "! Error" in the tray header. The JSON payload carries the real state.

    Before: error='status exit 1' on any down state.
    After: the payload is parsed and up=False is reported; error stays None.
    """
    module = load_tray(tmp_path)
    down = json.dumps({
        "up": False, "state": "down (proxy mode; run 'vpn on' for tun, 'start' for proxy)",
        "mode": "proxy", "port": 2080, "pid": None,
        "providers": {"proton": {"profiles": ["01-NL-FREE-140"], "active": "01-NL-FREE-140",
                                 "egress": {}}},
        "routing": {"mode": "default", "direct_domains": [], "vpn_domains": [],
                    "default_provider": None},
        "watcher": {"enabled": True, "running": False}, "preset": "opencode",
    })
    st = module.RouterStatus.from_cli(1, down)
    assert st.up is False
    assert st.error is None
    assert st.preset == "opencode"
    assert st.providers["proton"]["active"] == "01-NL-FREE-140"


def test_tray_fresh_install_is_not_error_and_shows_setup_banner(tmp_path):
    """A fresh install (no router.json) must NOT show "! Error status exit 1";
    the menu should point the user at Setup and leave Connect disabled."""
    module = load_tray(tmp_path)
    fresh = json.dumps({
        "up": False, "state": "down (unusable config; see error above)", "mode": None,
        "port": None, "providers": {}, "routes": [],
        "routing": {"mode": None, "direct_domains": [], "vpn_domains": [],
                    "default_provider": None},
    })
    st = module.RouterStatus.from_cli(1, fresh)
    assert st.error is None
    assert st.up is False
    assert st.providers == {}

    app = _tray_app(module, tmp_path)
    rows = _flatten(app.build_menu().items)
    labels = [text for _, text, _, _ in rows]
    assert "● No VPN set up yet" in labels
    assert "Start here: Setup → Add a profile (.conf)" in labels
    # Connect must be disabled until at least one provider exists
    connect_row = next(r for r in rows if r[1] in ("Connect", "Reconnect"))
    assert connect_row[2] is False


def test_tray_unparseable_status_is_error(tmp_path):
    """A status payload that fails to parse is the only thing that should
    surface as an error in the tray."""
    module = load_tray(tmp_path)
    st = module.RouterStatus.from_cli(1, "router: boom")
    assert st.error is not None
    assert st.up is False


def test_tray_presets_menu_includes_custom_presets(tmp_path):
    """Custom presets created in the setup TUI (presets/<name>.json) must
    appear in the tray Presets menu, checked when active."""
    module = load_tray(tmp_path)
    (tmp_path / "presets").mkdir()
    (tmp_path / "presets" / "banana.json").write_text(json.dumps({
        "routes": [{"id": "banana", "domains": ["opencode.ai"], "provider": "proton"}],
        "routing": {"mode": "vpn-list", "vpn_domains": ["opencode.ai"]},
    }))
    app = _tray_app(module, tmp_path, up=True, preset="banana",
                    providers={"proton": {"active": "01-NL-FREE-140",
                                          "profiles": ["01-NL-FREE-140"], "egress": {}}})
    rows = _flatten(app.build_menu().items)
    preset_rows = [(d, t, c) for d, t, e, c in rows if t.startswith("banana")]
    assert preset_rows, "custom preset missing from tray Presets menu"
    depth, label, checked = preset_rows[0]
    assert "opencode.ai via proton" in label
    assert checked is True  # active preset shows the checkmark


def test_tray_humanize_cli_output(tmp_path):
    """Raw CLI success/failure lines become user-facing text in the menu."""
    module = load_tray(tmp_path)
    assert module._humanize(
        "setup: run `proxy-router ensure` (or reload) to apply; the engine is untouched."
    ) == "saved — Connect to apply"
    assert module._humanize(
        "config saved; the engine was NOT reloaded - run 'router.py ensure' to apply"
    ) == "saved — Connect to apply"
    assert module._humanize(
        "router: no sing-box binary found at /usr/local/bin/sing-box"
    ) == "VPN engine not found — run Setup, then Connect"
    assert module._humanize(
        "routing mode 'safe-list' needs 'default_provider'"
    ) == "pick a default provider first: Routing mode → home (safe list)"
    assert module._humanize(
        "router: provider 'cloudflare': all profiles cooling down"
    ) == "no servers available right now — try again in a minute"


def test_tray_friendly_egress_error_mapping(tmp_path):
    """Raw probe error tails must become plain-language labels in the exit
    picker — an SSL URLError tail is operator jargon, not a menu item."""
    module = load_tray(tmp_path)
    f = module._friendly_egress_error
    assert f("URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING, "
             "EOF occurred in violation of protocol (_ssl.c:983)]>") == "offline (SSL)"
    assert f("URLError: timed out") == "timed out"
    assert f("URLError: connection refused") == "offline"
    assert f("URLError: [Errno -5] No address associated with hostname") == "no route (DNS)"
    assert f("429") == "rate-limited"
    assert f("HTTP 403") == "blocked"
    # unknown but short tails still truncate, not explode
    assert len(f("weird exotic failure mode")) <= 28


def test_tray_exit_picker_humanizes_raw_error(tmp_path):
    """profile_health must render a raw SSL/URLError as '! offline (SSL)',
    not the Python error tail (the screenshot bug)."""
    module = load_tray(tmp_path)
    bad = {"ok": False, "status": None, "latency_ms": None,
           "error": "URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING, "
                    "EOF occurred in violation of protocol (_ssl.c:983)]>",
           "blocked": False, "exhausted": False}
    app = _tray_app(module, tmp_path, up=True,
                    providers={"proton": {
                        "active": "01-NL-FREE-140",
                        "profiles": ["01-NL-FREE-140"],
                        "egress": {"01-NL-FREE-140": bad}}})
    health = app.latest.profile_health("proton", "01-NL-FREE-140")
    assert "offline (SSL)" in health, f"raw error tail leaked: {health!r}"
    assert "urlopen" not in health.lower(), f"Python error leaked: {health!r}"


def test_tray_provider_row_no_manual_checkmark_duplication(tmp_path):
    """The active provider row gets ONE checkmark from pystray's `checked=`;
    the old code ALSO appended '  ✓' to the label, rendering two checkmarks
    ('✓ cloudflare ● warp · 593ms ✓')."""
    module = load_tray(tmp_path)
    app = _tray_app(module, tmp_path, up=True,
                    providers={"proton": {
                        "active": "01-NL-FREE-140",
                        "profiles": ["01-NL-FREE-140"],
                        "egress": {"01-NL-FREE-140": {
                            "ok": True, "status": 200,
                            "latency_ms": 164.0, "error": None}}}})
    rows = _flatten(app.build_menu().items)
    provider_rows = [t for _, t, _, _ in rows if t.startswith("proton")]
    assert provider_rows, "provider row missing"
    label = provider_rows[0]
    assert label.count("✓") == 0, f"manual checkmark duplicated in label: {label!r}"
    # the footer must be plain language, not the 'exit' jargon
    footer = [t for _, t, _, _ in rows if "Click a" in t]
    assert footer and "location" in footer[0], f"footer jargon: {footer!r}"


def test_tray_upstream_error_shows_warning_not_green(tmp_path):
    """F1: a probe can ride the tunnel (ok=true) while the exit is actually
    rate-limited upstream (429 from rotate --reason). The tray must NOT show
    a healthy green dot — it should warn, but the exit stays CLICKABLE (a
    stale upstream_error is recoverable, not dead)."""
    module = load_tray(tmp_path)
    egress_ok_but_429 = {"ok": True, "status": 200, "latency_ms": 1203.26,
                         "error": None, "upstream_error": "429",
                         "exhausted": False}
    app = _tray_app(module, tmp_path, up=True,
                    providers={"proton": {
                        "active": "01-NL-FREE-140",
                        "profiles": ["01-NL-FREE-140"],
                        "egress": {"01-NL-FREE-140": egress_ok_but_429}}})
    # provider_label: warning marker (▲), never the green ●
    label = app.latest.provider_label("proton")
    assert "▲" in label, f"expected warning marker in {label!r}"
    assert "●" not in label, f"rate-limited exit shown as healthy: {label!r}"
    # profile_health: the 429 must surface in the exit picker as plain
    # language (raw "429" would be fine too, but "rate-limited" reads better)
    health = app.latest.profile_health("proton", "01-NL-FREE-140")
    assert "!" in health, f"upstream 429 not surfaced: {health!r}"
    assert "rate-limited" in health, f"429 not humanized: {health!r}"
    # but the exit stays clickable — recoverable warning ≠ dead
    assert not app._exit_disabled(app.latest, "proton", "01-NL-FREE-140"), \
        "recoverable 429 warning must not disable the exit"
    # a genuinely healthy lane keeps the green dot
    healthy = _tray_app(module, tmp_path, up=True,
                        providers={"proton": {
                            "active": "01-NL-FREE-140",
                            "profiles": ["01-NL-FREE-140"],
                            "egress": {"01-NL-FREE-140": {
                                "ok": True, "status": 200,
                                "latency_ms": 164.0, "error": None}}}})
    healthy_label = healthy.latest.provider_label("proton")
    assert "●" in healthy_label, f"healthy lane lost green dot: {healthy_label!r}"


def test_tray_transport_dead_exit_is_disabled(tmp_path):
    """An exit that died at transport level (no HTTP status) IS disabled —
    clicking it would just fail. This is the 'genuinely dead' case, distinct
    from a recoverable upstream_error warning."""
    module = load_tray(tmp_path)
    dead = {"ok": False, "status": None, "latency_ms": None,
            "error": "URLError: connection refused", "blocked": False,
            "exhausted": False}
    app = _tray_app(module, tmp_path, up=True,
                    providers={"proton": {
                        "active": "01-NL-FREE-140",
                        "profiles": ["01-NL-FREE-140", "02-NL-FREE-149"],
                        "egress": {"01-NL-FREE-140": dead,
                                   "02-NL-FREE-149": {
                                       "ok": True, "status": 200,
                                       "latency_ms": 164.0, "error": None}}}})
    assert app._exit_disabled(app.latest, "proton", "01-NL-FREE-140")
    assert not app._exit_disabled(app.latest, "proton", "02-NL-FREE-149")


def test_tray_exit_picker_sorts_healthy_first(tmp_path):
    """Dead exits sink to the bottom of the provider picker — the menu
    shouldn't lead with a wall of grayed-out 'offline (SSL)' rows."""
    module = load_tray(tmp_path)
    dead = {"ok": False, "status": None, "latency_ms": None,
            "error": "URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING]>",
            "blocked": False, "exhausted": False}
    healthy = {"ok": True, "status": 200, "latency_ms": 164.0, "error": None}
    app = _tray_app(module, tmp_path, up=True,
                    providers={"proton": {
                        "active": "02-NL-FREE-149",
                        "profiles": ["00-US-FREE-108", "01-NL-FREE-140",
                                     "02-NL-FREE-149"],
                        "egress": {"00-US-FREE-108": dead,
                                   "01-NL-FREE-140": dead,
                                   "02-NL-FREE-149": healthy}}})
    rows = _flatten(app.build_menu().items)
    # Provider submenu rows are at depth 2; grab the exit entries under proton
    exit_rows = [t for d, t, e, _ in rows if d == 2 and "FREE" in t]
    assert exit_rows[0].startswith("02-NL-FREE-149"), \
        f"healthy exit should sort first: {exit_rows}"
    # both dead exits sink to the bottom (alphabetical among themselves)
    assert all(not r.startswith("02-NL-FREE-149") for r in exit_rows[1:]), \
        f"dead exits should all sort after healthy: {exit_rows}"
    # disabled flags still correct after sorting
    enabled = [e for d, t, e, _ in rows if d == 2 and "FREE" in t]
    assert enabled[0] is True and enabled[-1] is False


def test_record_egress_heals_stale_upstream_error(tmp_path):
    """A passing probe must clear a stale upstream_error marker (e.g. 429
    from `rotate --reason` hours ago). Without this, the tray keeps showing
    a warning/disable on an exit that already recovered."""
    router = load_router(tmp_path)
    (tmp_path / "state" / "egress" / "proton").mkdir(parents=True)
    profile = Path("01-NL-FREE-140.conf")
    router.record_egress("proton", profile, ok=False, status=None,
                         error="URLError: timeout")
    router.record_egress("proton", profile, ok=True, status=200,
                         latency_ms=120.0, error=None)
    rec = router.read_egress("proton", profile)
    assert rec["ok"] is True
    assert rec["upstream_error"] is None
    assert rec["upstream_error_at"] is None
    assert rec["error"] is None


class _UnreadableModeFile:
    def is_file(self):
        return True

    def read_text(self):
        raise PermissionError(1, "operation not permitted")


def test_vpn_on_disables_system_proxy_after_tun_start(tmp_path, monkeypatch):
    """ROOT CAUSE: `vpn on` switched the engine to tun mode (no
    127.0.0.1:2080 listener) but left the macOS system proxy enabled, so
    browsers sent traffic to a dead port and every site failed with a
    connection reset. A successful tun start must disable the system proxy."""
    router = load_router(tmp_path)
    router.current_mode = lambda: "proxy"
    router.set_mode = lambda m: None
    router.resolve_sing_box = lambda: Path("/bin/true")
    router.sing_box_at_least = lambda v: True
    router.build_singbox_config = lambda: ({"inbounds": [{"type": "tun"}]}, {"proton": Path("p")})
    router.write_sing_box = lambda c: None
    router.validate_config = lambda: True
    router.vpn_note = lambda: None
    router.engine_start = lambda: 0
    calls = []
    router.system_proxy_off = lambda: calls.append("off") or 0
    monkeypatch.setattr("sys.platform", "darwin")

    assert router.vpn_on() == 0
    assert calls == ["off"]


def test_vpn_on_already_up_still_disables_system_proxy(tmp_path, monkeypatch):
    """Re-entering `vpn on` while tun is already up must be idempotent:
    a stale system proxy (left on by an older version) must be cleared
    even when the engine is not restarted."""
    router = load_router(tmp_path)
    router.current_mode = lambda: "tun"
    router.engine_alive = lambda: True
    router.engine_mode_consistent = lambda: True
    calls = []
    router.system_proxy_off = lambda: calls.append("off") or 0
    monkeypatch.setattr("sys.platform", "darwin")

    assert router.vpn_on() == 0
    assert calls == ["off"]


def test_vpn_off_reenables_system_proxy_in_proxy_mode(tmp_path, monkeypatch):
    """Returning to proxy mode restores the listener-based system proxy,
    mirroring the tun-mode disable; without it the browser stays broken
    after `vpn off`."""
    router = load_router(tmp_path)
    router.set_mode = lambda m: None
    router.engine_stop = lambda: 0
    router.engine_start = lambda: 0
    calls = []
    router.system_proxy_on = lambda: calls.append("on") or 0
    monkeypatch.setattr("sys.platform", "darwin")

    assert router.vpn_off() == 0
    assert calls == ["on"]


def test_engine_alive_permission_error_means_our_engine(tmp_path, monkeypatch):
    """ROOT CAUSE: an engine started via `sudo vpn on` runs as root; the
    regular-user liveness probe os.kill(pid, 0) raises PermissionError,
    which was swallowed by the generic OSError catch and misread as
    "process gone", so the keepalive kept restarting a live engine and
    deleted its pid file. PermissionError means the process EXISTS and our
    pid file names it -> it is alive and ours."""
    router = load_router(tmp_path)
    router.PID_FILE.write_text("4242")
    router._pid_matches = lambda pid: True

    def deny_kill(pid, sig):
        raise PermissionError(1, "operation not permitted")

    monkeypatch.setattr(router.os, "kill", deny_kill)
    assert router.engine_alive() is True


def test_engine_stop_permission_error_keeps_pid_file(tmp_path, monkeypatch):
    """A regular-user engine_stop on a sudo-started (root) engine cannot
    signal it: it must fail loudly and keep the pid file (the engine IS
    alive), not delete the pid file and pretend it stopped."""
    router = load_router(tmp_path)
    router.PID_FILE.write_text("4242")
    router._pid_matches = lambda pid: True

    def deny_kill(pid, sig):
        raise PermissionError(1, "operation not permitted")

    monkeypatch.setattr(router.os, "kill", deny_kill)
    assert router.engine_stop() == 1
    assert router.PID_FILE.is_file()


def test_current_mode_unreadable_mode_file_defaults_to_proxy(tmp_path, monkeypatch):
    """A root-owned mode file (from a sudo run) must not crash the
    regular-user CLI/keepalive; unreadable state defaults to proxy mode."""
    router = load_router(tmp_path)
    router.MODE_FILE = _UnreadableModeFile()
    assert router.current_mode() == "proxy"


def test_hand_back_ownership_chowns_when_sudo_invoked(tmp_path, monkeypatch):
    """When running as root under sudo, state files must be handed back to
    the invoking user (SUDO_UID/SUDO_GID) so the regular-user keepalive/CLI
    can read them."""
    router = load_router(tmp_path)
    target = tmp_path / "state-file"
    target.write_text("x")
    monkeypatch.setattr(router.os, "geteuid", lambda: 0)
    monkeypatch.setenv("SUDO_UID", "501")
    monkeypatch.setenv("SUDO_GID", "20")
    chowned = []
    monkeypatch.setattr(router.os, "chown", lambda path, uid, gid: chowned.append((str(path), uid, gid)))

    router._hand_back_ownership(target)
    assert chowned == [(str(target), 501, 20)]


def test_hand_back_ownership_noop_for_regular_user(tmp_path, monkeypatch):
    """A non-root run must never chown state files."""
    router = load_router(tmp_path)
    target = tmp_path / "state-file"
    target.write_text("x")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    chowned = []
    monkeypatch.setattr(router.os, "chown", lambda *args: chowned.append(args))

    router._hand_back_ownership(target)
    assert chowned == []


class _TTY:
    """Stands in for sys.stdin so elevation TTY checks can be controlled."""

    def __init__(self, isatty):
        self._isatty = isatty

    def isatty(self):
        return self._isatty


def test_needs_elevation_vpn_on_interactive_darwin_nonroot(tmp_path, monkeypatch):
    """`vpn on` as a regular user on macOS must re-run elevated so the
    standard admin-password dialog asks permission instead of a manual sudo."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    args = type("A", (), {"cmd": "vpn", "action": "on"})()
    assert router._needs_elevation(args) is True


def test_needs_elevation_vpn_off_only_in_tun_mode(tmp_path, monkeypatch):
    """`vpn off` needs root only while TUN is active (engine runs as root);
    in proxy mode the engine is user-owned so no elevation is needed."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    args = type("A", (), {"cmd": "vpn", "action": "off"})()
    router.MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    router.MODE_FILE.write_text("tun")
    assert router._needs_elevation(args) is True
    router.MODE_FILE.write_text("proxy")
    assert router._needs_elevation(args) is False


def test_needs_elevation_engine_commands_only_in_tun_mode(tmp_path, monkeypatch):
    """start/stop/ensure/reload/rotate/add/remove touch the engine, which in
    tun mode runs as root -> elevate; in proxy mode they stay user-level."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    router.MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    router.MODE_FILE.write_text("tun")
    for cmd in ("start", "stop", "ensure", "reload", "rotate", "add", "remove"):
        args = type("A", (), {"cmd": cmd})()
        assert router._needs_elevation(args) is True, cmd
    router.MODE_FILE.write_text("proxy")
    for cmd in ("start", "stop", "ensure", "reload", "rotate", "add", "remove"):
        args = type("A", (), {"cmd": cmd})()
        assert router._needs_elevation(args) is False, cmd


def test_needs_elevation_skips_readonly_and_status_commands(tmp_path, monkeypatch):
    """Read-only commands (status, routes, vpn status) never elevate."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    router.MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    router.MODE_FILE.write_text("tun")
    for cmd, action in (("status", None), ("routes", None), ("vpn", "status")):
        args = type("A", (), {"cmd": cmd, "action": action})()
        assert router._needs_elevation(args) is False, cmd


def test_needs_elevation_skips_noninteractive_keepalive(tmp_path, monkeypatch):
    """keepalive/launchd ticks run without a TTY and must never pop the
    admin-password dialog on every 15s interval."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(False))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    router.MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    router.MODE_FILE.write_text("tun")
    args = type("A", (), {"cmd": "vpn", "action": "on"})()
    assert router._needs_elevation(args) is False


def test_needs_elevation_skips_root_and_elevated_child(tmp_path, monkeypatch):
    """Already-root runs (sudo, or the elevated child) never re-elevate."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    args = type("A", (), {"cmd": "vpn", "action": "on"})()
    monkeypatch.setattr(router.os, "geteuid", lambda: 0)
    assert router._needs_elevation(args) is False
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setenv("PROXY_ROUTER_ELEVATED", "1")
    assert router._needs_elevation(args) is False


def test_elevate_macos_runs_osascript_with_admin_privileges(tmp_path, monkeypatch):
    """The elevated child must be the same CLI, with SUDO_UID/SUDO_GID and
    PATH injected so ownership hand-back and sing-box resolution work."""
    router = load_router(tmp_path)
    calls = []
    monkeypatch.setattr(router.os, "getuid", lambda: 501)
    monkeypatch.setattr(router.os, "getgid", lambda: 20)
    monkeypatch.setattr(router.os, "environ", {"PATH": "/usr/bin:/bin"}, raising=False)
    monkeypatch.setattr(router.sys, "argv", ["router.py", "vpn", "on"])
    monkeypatch.setattr(router.sys, "executable", "/usr/bin/python3")
    monkeypatch.setattr(router.subprocess, "run",
                        lambda *a, **k: calls.append((a, k)) or type("P", (), {"returncode": 0})())

    router._elevate_macos()
    assert calls, "osascript was never invoked"
    (pos, kwargs), = calls
    argv = pos[0]
    assert argv[:2] == ["osascript", "-e"]
    script = argv[2]
    assert "with administrator privileges" in script
    assert "SUDO_UID=501" in script
    assert "SUDO_GID=20" in script
    assert "PROXY_ROUTER_ELEVATED=1" in script
    assert "PATH=/usr/bin:/bin" in script
    assert "vpn" in script and "on" in script


def test_elevate_macos_escapes_applescript_specials(tmp_path, monkeypatch):
    """Quotes/backslashes in args must survive the AppleScript string literal
    (e.g. an --id with quotes): content `\"`/`\\` escapes, literal delimiters
    stay unescaped (a `\` at expression position is a -2741 syntax error)."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.os, "getuid", lambda: 501)
    monkeypatch.setattr(router.os, "getgid", lambda: 20)
    monkeypatch.setattr(router.os, "environ", {"PATH": "/usr/bin"}, raising=False)
    monkeypatch.setattr(router.sys, "argv", ["router.py", "add", "--id", 'we"ird\\id', "--domain", "x.example"])
    monkeypatch.setattr(router.sys, "executable", "/usr/bin/python3")
    captured = []
    monkeypatch.setattr(router.subprocess, "run",
                        lambda *a, **k: captured.append(a[0]) or type("P", (), {"returncode": 0})())

    router._elevate_macos()
    script = captured[0][2]
    assert script.startswith('do shell script "')
    assert 'we\\"ird\\\\id' in script
    assert script.endswith('" with administrator privileges')


def test_needs_elevation_vpn_restart_always(tmp_path, monkeypatch):
    """`vpn restart` stops the engine and re-enters tun; it always needs root
    so the whole cycle gets ONE admin prompt instead of two."""
    router = load_router(tmp_path)
    monkeypatch.setattr(router.sys, "platform", "darwin")
    monkeypatch.setattr(router.os, "geteuid", lambda: 501)
    monkeypatch.setattr(router.sys, "stdin", _TTY(True))
    monkeypatch.delenv("PROXY_ROUTER_ELEVATED", raising=False)
    router.MODE_FILE.parent.mkdir(parents=True, exist_ok=True)
    router.MODE_FILE.write_text("proxy")
    args = type("A", (), {"cmd": "vpn", "action": "restart"})()
    assert router._needs_elevation(args) is True


def test_vpn_restart_stops_then_brings_tun_up(tmp_path, monkeypatch):
    """vpn_restart = engine_stop then vpn_on; a failed stop short-circuits."""
    router = load_router(tmp_path)
    calls = []
    monkeypatch.setattr(router, "engine_stop", lambda: calls.append("stop") or 0)
    monkeypatch.setattr(router, "vpn_on", lambda: calls.append("on") or 0)
    assert router.vpn_restart() == 0
    assert calls == ["stop", "on"]
    calls.clear()
    monkeypatch.setattr(router, "engine_stop", lambda: calls.append("stop") or 1)
    assert router.vpn_restart() == 1
    assert calls == ["stop"]


class _UnreadablePidFile:
    """Pid file a regular user cannot read (root-owned, mode 0600 after a
    `sudo vpn on` batch)."""

    def __init__(self):
        self.unlink_calls = 0

    def is_file(self):
        return True

    def read_text(self):
        raise PermissionError(1, "operation not permitted")

    def unlink(self, missing_ok=False):
        self.unlink_calls += 1


def test_engine_start_aborts_when_engine_stop_fails(tmp_path, monkeypatch):
    """ROOT CAUSE: engine_start ignored engine_stop()'s failure and started
    a second engine on top of a live root-owned one. The doomed Popen then
    failed (no utun access), wait_engine failed, engine_stop unlinked the
    pid file, and the root engine was left running untracked. A failed stop
    must abort the start."""
    router = load_router(tmp_path)
    router.resolve_sing_box = lambda: Path("/bin/true")
    router.sing_box_at_least = lambda v: True
    router.build_singbox_config = lambda overrides=None: ({"inbounds": []}, {"proton": Path("p")})
    router.write_sing_box = lambda c: None
    router.validate_config = lambda: True
    router.engine_stop = lambda: 1
    popen_calls = []
    monkeypatch.setattr(router.subprocess, "Popen", lambda *a, **k: popen_calls.append(a) or object())
    assert router.engine_start() == 1
    assert popen_calls == []


def test_engine_stop_unreadable_pid_keeps_pid_file(tmp_path, monkeypatch):
    """ROOT CAUSE: engine_stop's garbage branch caught PermissionError
    (an OSError subclass) on the pid-file read and unlinked the file, which
    for a root-owned live engine destroys the only ownership record. An
    unreadable pid file must fail loudly and stay in place."""
    router = load_router(tmp_path)
    pid_file = _UnreadablePidFile()
    router.PID_FILE = pid_file
    assert router.engine_stop() == 1
    assert pid_file.unlink_calls == 0


def test_engine_alive_unreadable_pid_uses_ps_scan_fallback(tmp_path, monkeypatch):
    """ROOT CAUSE: engine_alive read PermissionError as "process gone", so
    the keepalive kept restarting a live root-owned engine and deleted its
    pid file. An unreadable pid file must fall back to a process-table scan
    instead of declaring the engine dead."""
    router = load_router(tmp_path)
    router.PID_FILE = _UnreadablePidFile()
    monkeypatch.setattr(router, "_any_our_engine_running", lambda: True)
    assert router.engine_alive() is True
    monkeypatch.setattr(router, "_any_our_engine_running", lambda: False)
    assert router.engine_alive() is False


def test_any_our_engine_running_scans_posix_process_table(tmp_path, monkeypatch):
    """_any_our_engine_running matches a live sing-box by our generated
    config path in its command line, so a foreign/unrelated process can
    never claim liveness."""
    router = load_router(tmp_path)

    class _RunResult:
        def __init__(self, stdout):
            self.stdout = stdout

    router.os = type("_Os", (), {"name": "posix"})()
    dead_cmd = "some other process -c /etc/sing-box/config.json"
    live_cmd = f"sing-box run -c {router.SING_BOX_CONFIG}"
    monkeypatch.setattr(router.subprocess, "run", lambda *a, **k: _RunResult(live_cmd))
    assert router._any_our_engine_running() is True
    monkeypatch.setattr(router.subprocess, "run", lambda *a, **k: _RunResult(dead_cmd))
    assert router._any_our_engine_running() is False


def test_engine_reload_permission_error_on_sighup_only(tmp_path, monkeypatch):
    """ROOT CAUSE: engine_reload caught only ProcessLookupError around the
    SIGHUP, so a regular-user reload of a root-owned engine crashed with an
    unhandled PermissionError traceback. It must fail with the sudo hint
    and leave the pid file alone."""
    router = load_router(tmp_path)
    router.resolve_sing_box = lambda: Path("/bin/true")
    router.sing_box_at_least = lambda v: True
    router.build_singbox_config = lambda overrides=None: ({"inbounds": []}, {"proton": Path("p")})
    router.write_sing_box = lambda c: None
    router.validate_config = lambda: True
    router.PID_FILE.write_text("4242")
    router._pid_matches = lambda pid: True
    start_calls = []
    monkeypatch.setattr(router, "engine_start", lambda **k: start_calls.append(k) or 0)

    def deny_sighup(pid, sig):
        raise PermissionError(1, "operation not permitted")

    monkeypatch.setattr(router.os, "kill", deny_sighup)
    assert router.engine_reload() == 1
    assert start_calls == []
    assert router.PID_FILE.read_text() == "4242"


def test_restore_last_good_permission_error_on_sighup_only(tmp_path, monkeypatch):
    """restore_last_good must not crash on a root-owned engine either: a
    SIGHUP PermissionError fails the restore (rc 1) without touching the
    pid file or attempting a doomed regular-user start."""
    router = load_router(tmp_path)
    router.LAST_GOOD_FILE.write_text("{}")
    router.validate_config = lambda: True
    router.PID_FILE.write_text("4242")
    router._pid_matches = lambda pid: True
    start_calls = []
    monkeypatch.setattr(router, "engine_start", lambda **k: start_calls.append(k) or 0)

    def deny_sighup(pid, sig):
        raise PermissionError(1, "operation not permitted")

    monkeypatch.setattr(router.os, "kill", deny_sighup)
    assert router.restore_last_good() == 1
    assert start_calls == []
    assert router.PID_FILE.read_text() == "4242"


def test_tray_full_tunnel_toggle_checked_when_tun(tmp_path):
    """The tray must expose the full-tunnel (TUN) state as a checked menu
    item so the user can see "on" and click to turn it off from the menu."""
    module = load_tray(tmp_path)
    app = _tray_app(module, tmp_path, up=True, mode="tun")
    rows = _flatten(app.build_menu().items)
    labels = [text for _, text, _, _ in rows]
    assert "Full tunnel (WARP): on" in labels
    toggle = next(r for r in rows if r[1].startswith("Full tunnel (WARP)"))
    assert toggle[3] is True  # checked


def test_tray_full_tunnel_toggle_unchecked_when_proxy(tmp_path):
    """In proxy mode the toggle renders off/unchecked; clicking it turns
    the full tunnel back on."""
    module = load_tray(tmp_path)
    app = _tray_app(module, tmp_path, up=True, mode="proxy")
    rows = _flatten(app.build_menu().items)
    toggle = next(r for r in rows if r[1].startswith("Full tunnel (WARP)"))
    assert toggle[1] == "Full tunnel (WARP): off"
    assert toggle[3] is False


def test_tray_full_tunnel_toggle_invokes_vpn_action(tmp_path, monkeypatch):
    """The toggle's action must route through the router CLI (`vpn off` when
    tun is on, `vpn on` when it isn't) — the tray never mutates engine
    state directly."""
    module = load_tray(tmp_path)
    app = _tray_app(module, tmp_path, up=True, mode="tun")
    calls = []
    monkeypatch.setattr(app.client, "vpn", lambda a: calls.append(a) or (0, ""))
    app.action_toggle_vpn()
    assert calls == ["off"]

    app2 = _tray_app(module, tmp_path, up=True, mode="proxy")
    calls2 = []
    monkeypatch.setattr(app2.client, "vpn", lambda a: calls2.append(a) or (0, ""))
    app2.action_toggle_vpn()
    assert calls2 == ["on"]


def test_tray_vpn_off_elevates_via_osascript_on_darwin(tmp_path, monkeypatch):
    """ROOT CAUSE: the tray runs under launchd with no TTY, so router.py's
    isatty-gated `_elevate_macos` never fires from it; a plain `vpn off`
    subprocess would hit the new PermissionError guard and fail with the
    "run with sudo" hint instead of doing anything useful. The tray must
    drive the osascript admin dialog itself, with the same SUDO_UID/SUDO_GID
    hand-back env the CLI injects."""
    module = load_tray(tmp_path)
    monkeypatch.setattr(module.sys, "platform", "darwin")
    monkeypatch.setattr(module.os, "getuid", lambda: 501)
    monkeypatch.setattr(module.os, "getgid", lambda: 20)
    monkeypatch.setattr(module.os, "environ", {"PATH": "/usr/bin:/bin"}, raising=False)
    calls = []
    monkeypatch.setattr(module.subprocess, "run",
                        lambda *a, **k: calls.append((a, k)) or type("P", (), {
                            "returncode": 0, "stdout": "", "stderr": ""})())

    client = module.RouterClient(str(tmp_path))
    rc, out = client.vpn("off")
    assert rc == 0
    (pos, kwargs), = calls
    argv = pos[0]
    assert argv[:2] == ["osascript", "-e"]
    script = argv[2]
    assert "with administrator privileges" in script
    assert "SUDO_UID=501" in script
    assert "SUDO_GID=20" in script
    assert "PROXY_ROUTER_ELEVATED=1" in script
    assert "router.py" in script and "vpn off" in script
    assert kwargs.get("timeout") == module.ELEVATED_COMMAND_TIMEOUT


def test_tray_vpn_uses_plain_cli_off_macos(tmp_path, monkeypatch):
    """Non-macOS has no osascript dialog; the toggle falls back to the plain
    CLI, whose clear error tells the user to run it with sudo."""
    module = load_tray(tmp_path)
    monkeypatch.setattr(module.sys, "platform", "linux")
    calls = []
    monkeypatch.setattr(module.subprocess, "run",
                        lambda *a, **k: calls.append(a) or type("P", (), {
                            "returncode": 0, "stdout": "", "stderr": ""})())

    client = module.RouterClient(str(tmp_path))
    rc, out = client.vpn("off")
    assert rc == 0
    assert calls and calls[0][0][-2:] == ["vpn", "off"]
    assert not any(c[0][0] == "osascript" for c in calls)
