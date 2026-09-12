#!/usr/bin/env bash

set -euo pipefail

rpm_path=${1:?Pass the RPM path as the first argument}
runtime_root=$(mktemp -d)
launch_log="$runtime_root/launch.log"
wrapper_pid=''

stop_airi() {
  pkill -TERM -f '^/opt/AIRI/airi( |$)' 2>/dev/null || true
  if [[ -n "$wrapper_pid" ]]; then
    kill -TERM "$wrapper_pid" 2>/dev/null || true
  fi

  sleep 2
  pkill -KILL -f '^/opt/AIRI/airi( |$)' 2>/dev/null || true
  if [[ -n "$wrapper_pid" ]]; then
    kill -KILL "$wrapper_pid" 2>/dev/null || true
    wait "$wrapper_pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_airi
  if rpm -q ai.moeru.airi >/dev/null 2>&1; then
    dnf remove -y ai.moeru.airi >/dev/null
  fi
  rm -rf "$runtime_root"
}

assert_path_absent() {
  local path=$1
  if [[ -e "$path" || -L "$path" ]]; then
    echo "Unexpected path after RPM removal: $path" >&2
    return 1
  fi
}

trap cleanup EXIT

dnf install -y desktop-file-utils procps-ng xorg-x11-server-Xvfb
dnf install -y "$rpm_path"

rpm -V ai.moeru.airi
test "$(readlink -e /usr/bin/airi)" = '/opt/AIRI/airi'
desktop-file-validate /usr/share/applications/airi.desktop

reinstall_log="$runtime_root/reinstall.log"
dnf reinstall -y "$rpm_path" 2>&1 | tee "$reinstall_log"
if grep -Fq 'has not been configured as an alternative' "$reinstall_log"; then
  echo 'RPM reinstall used the wrong alternatives target.' >&2
  exit 1
fi

rpm -V ai.moeru.airi
test "$(readlink -e /usr/bin/airi)" = '/opt/AIRI/airi'

mkdir -p "$runtime_root/home" "$runtime_root/config" "$runtime_root/cache" "$runtime_root/user-data"
env \
  HOME="$runtime_root/home" \
  XDG_CONFIG_HOME="$runtime_root/config" \
  XDG_CACHE_HOME="$runtime_root/cache" \
  xvfb-run -a /opt/AIRI/airi \
    --no-sandbox \
    --disable-gpu \
    --user-data-dir="$runtime_root/user-data" \
    >"$launch_log" 2>&1 &
wrapper_pid=$!

sleep 15
if ! kill -0 "$wrapper_pid" 2>/dev/null && ! pgrep -f '^/opt/AIRI/airi( |$)' >/dev/null; then
  echo 'AIRI exited before the Fedora launch window ended.' >&2
  sed -n '1,200p' "$launch_log" >&2
  exit 1
fi
echo 'LAUNCH_STAYED_ACTIVE'

stop_airi
wrapper_pid=''
if pgrep -f '^/opt/AIRI/airi( |$)' >/dev/null; then
  echo 'AIRI processes remained after Fedora launch cleanup.' >&2
  pgrep -af '^/opt/AIRI/airi( |$)' >&2
  exit 1
fi

dnf remove -y ai.moeru.airi

if rpm -q ai.moeru.airi >/dev/null 2>&1; then
  echo 'The AIRI RPM remained installed after removal.' >&2
  exit 1
fi

assert_path_absent /usr/bin/airi
assert_path_absent /etc/alternatives/airi
assert_path_absent /usr/share/applications/airi.desktop
assert_path_absent /etc/apparmor.d/airi
assert_path_absent /opt/AIRI

trap - EXIT
rm -rf "$runtime_root"
echo 'FEDORA_RPM_LIFECYCLE_PASSED'
