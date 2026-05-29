#!/usr/bin/env bash
# Sets up the system Electron v42 for use with electron-vite and Node's require.resolve.
set -euo pipefail

SYSTEM_ELECTRON_LIB="/usr/lib/electron42"
SYSTEM_ELECTRON_BIN="${SYSTEM_ELECTRON_LIB}/electron"

if [ ! -x "$SYSTEM_ELECTRON_BIN" ]; then
  echo "[symlink-electron] ERROR: $SYSTEM_ELECTRON_BIN not found or not executable"
  exit 1
fi

for MODULE_DIR in "node_modules/electron" "apps/stage-tamagotchi/node_modules/electron"; do
  mkdir -p "$MODULE_DIR/dist"

  # Symlink everything EXCEPT the electron binary itself
  for item in "$SYSTEM_ELECTRON_LIB"/*; do
    local_name="$(basename "$item")"
    [ "$local_name" = "electron" ] && continue
    ln -sf "$item" "$MODULE_DIR/dist/$local_name" 2>/dev/null || true
  done

  # Create a wrapper script for the electron binary (not a symlink!)
  # This prevents require.resolve from following through to /usr/lib/electron42/
  cat > "$MODULE_DIR/dist/electron" << 'WRAPPER'
#!/usr/bin/env bash
exec /usr/lib/electron42/electron "$@"
WRAPPER
  chmod +x "$MODULE_DIR/dist/electron"

  # Create package.json
  cat > "$MODULE_DIR/package.json" << 'PKGJSON'
{
  "name": "electron",
  "version": "42.3.0",
  "main": "dist/electron"
}
PKGJSON

  # Create path.txt in dist/ (where electron-vite looks for it)
  echo "electron" > "$MODULE_DIR/dist/path.txt"

  echo "[symlink-electron] Linked: $MODULE_DIR -> $SYSTEM_ELECTRON_LIB"
done
