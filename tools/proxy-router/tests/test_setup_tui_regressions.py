from __future__ import annotations

import builtins
import importlib.util
import json
import sys
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_setup_tui():
    name = "setup_tui_under_test"
    spec = importlib.util.spec_from_file_location(name, ROOT / "setup_tui.py")
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_line_wizard_can_create_custom_preset(tmp_path):
    """The pipe/line fallback must expose the custom-preset path too.

    The fullscreen TUI already had this flow, but the line wizard only let
    users apply presets; ``setup> s`` gave no way to create one.
    """
    module = load_setup_tui()
    answers = iter(["new", "banana", "proton", "opencode.ai,roblox.com"])
    with patch.object(builtins, "input", side_effect=lambda _prompt: next(answers)):
        rc = module._cmd_preset_prompt(tmp_path)

    assert rc == 0
    preset = json.loads((tmp_path / "presets" / "banana.json").read_text())
    assert preset["routes"] == [{
        "id": "banana",
        "domains": ["opencode.ai", "roblox.com"],
        "provider": "proton",
    }]
    assert preset["routing"] == {
        "mode": "vpn-list",
        "vpn_domains": ["opencode.ai", "roblox.com"],
    }
