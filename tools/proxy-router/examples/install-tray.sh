#!/bin/bash
# install-tray.sh — install the proxy-router menu-bar agent as a login item.
#
# Fills examples/com.proxy-router.tray.plist.template, writes
# ~/Library/LaunchAgents/com.proxy-router.tray.plist, and bootstraps it with
# launchctl. Idempotent: refuses to double-install a live agent.
#
# Usage: install-tray.sh [--remove] [--root PATH]
set -euo pipefail

ROOT="${PROXY_ROUTER_ROOT:-/Users/kyson/airi/tools/proxy-router}"
PYTHON="${PYTHON:-/opt/anaconda3/bin/python3}"
PLIST_SRC="$ROOT/examples/com.proxy-router.tray.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/com.proxy-router.tray.plist"
LOG_DIR="$HOME/Library/Logs/proxy-router"
LABEL="com.proxy-router.tray"

case "${1:-}" in
  --remove)
    echo "unloading $LABEL..."
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST_DST"
    echo "removed $PLIST_DST"
    exit 0
    ;;
  --root)
    ROOT="${2:?--root needs a path}"
    ;;
esac

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "python not found at $PYTHON" >&2
  exit 1
fi

if ! "$PYTHON" -c "import pystray, PIL" 2>/dev/null; then
  echo "missing pystray/pillow for $PYTHON; run: $PYTHON -m pip install pystray pillow" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

if launchctl list | grep -q "$LABEL"; then
  echo "$LABEL already loaded; refusing to stack (use --remove first)"
  exit 1
fi

if [ ! -f "$PLIST_SRC" ]; then
  echo "missing template: $PLIST_SRC" >&2
  exit 1
fi

ATHOME="$HOME"
sed -e "s|@ROOT@|$ROOT|g" \
    -e "s|@PYTHON@|$PYTHON|g" \
    -e "s|@LOG_DIR@|$LOG_DIR|g" \
    -e "s|@PATH@|/opt/anaconda3/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin|g" \
    "$PLIST_SRC" > "$PLIST_DST"

chmod 644 "$PLIST_DST"
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "installed $LABEL -> $PLIST_DST"
echo "menu-bar agent starts at next login; to force start now:"
echo "  launchctl kickstart -k gui/$(id -u)/$LABEL"