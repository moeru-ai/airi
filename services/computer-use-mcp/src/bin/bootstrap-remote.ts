import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { resolveComputerUseConfig } from '../config'
import { normalizeRemoteShellPath, runRemoteCommand, uploadDirectoryToRemote } from '../remote/ssh'
import { runProcess } from '../utils/process'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = resolve(packageDir, 'dist')
const remoteInstallDir = normalizeRemoteShellPath(env.COMPUTER_USE_REMOTE_INSTALL_DIR?.trim() || '$HOME/.local/share/airi-desktop-runner')
const remoteRunnerPath = normalizeRemoteShellPath(env.COMPUTER_USE_REMOTE_RUNNER_COMMAND?.trim() || '$HOME/.local/bin/airi-desktop-runner')
const allowRemotePackageInstall = env.COMPUTER_USE_REMOTE_ALLOW_PACKAGE_INSTALL === '1'

async function buildLocalBundle() {
  await runProcess('pnpm', ['build'], {
    cwd: packageDir,
    timeoutMs: 180_000,
    env,
  })
}

async function ensureRemoteDependencies() {
  const config = resolveComputerUseConfig()

  const packages = [
    'nodejs',
    'xvfb',
    'xauth',
    'xdotool',
    'wmctrl',
    'scrot',
    'openbox',
    'x11-utils',
    'x11-xserver-utils',
    'mousepad',
    'xdg-utils',
  ].join(' ')

  const requiredCommands = [
    'node',
    'Xvfb',
    'xauth',
    'xdotool',
    'wmctrl',
    'scrot',
    'openbox',
    'xdpyinfo',
    'xprop',
    'mousepad',
    'xdg-open',
  ].join(' ')

  await runRemoteCommand(config, `
missing=""
for cmd in ${requiredCommands}; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing="$missing $cmd"
  fi
done

if [ -z "$missing" ]; then
  exit 0
fi

echo "missing remote runner dependencies:$missing" >&2

if [ "${allowRemotePackageInstall ? '1' : '0'}" != "1" ]; then
  echo "install the missing dependencies manually, or rerun with COMPUTER_USE_REMOTE_ALLOW_PACKAGE_INSTALL=1 to allow apt-get installation" >&2
  exit 19
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get is required when COMPUTER_USE_REMOTE_ALLOW_PACKAGE_INSTALL=1" >&2
  exit 18
fi

if ! sudo -n true >/dev/null 2>&1; then
  echo "passwordless sudo is required when COMPUTER_USE_REMOTE_ALLOW_PACKAGE_INSTALL=1" >&2
  exit 17
fi

sudo env DEBIAN_FRONTEND=noninteractive apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages}
`, {
    timeoutMs: 240_000,
  })
}

async function installRemoteRunner() {
  const config = resolveComputerUseConfig()
  await runRemoteCommand(config, `
mkdir -p ${remoteInstallDir}
mkdir -p $(dirname ${remoteRunnerPath})
`, {
    timeoutMs: 30_000,
  })

  await uploadDirectoryToRemote(config, {
    sourceDir: distDir,
    remoteDir: `${remoteInstallDir}/dist`,
    timeoutMs: 180_000,
  })

  const wrapper = `#!/usr/bin/env sh
set -eu
exec node ${remoteInstallDir}/dist/bin/runner.mjs
`

  await runRemoteCommand(config, `cat > ${remoteRunnerPath} && chmod +x ${remoteRunnerPath}`, {
    stdin: wrapper,
    timeoutMs: 30_000,
  })

  await runRemoteCommand(config, `
test -x ${remoteRunnerPath}
test -f ${remoteInstallDir}/dist/bin/runner.mjs
node --version
`, {
    timeoutMs: 15_000,
  })
}

async function main() {
  const config = resolveComputerUseConfig()
  if (!config.remoteSshHost || !config.remoteSshUser) {
    throw new Error('bootstrap:remote requires COMPUTER_USE_REMOTE_SSH_HOST and COMPUTER_USE_REMOTE_SSH_USER')
  }

  await buildLocalBundle()
  await ensureRemoteDependencies()
  await installRemoteRunner()

  console.info(JSON.stringify({
    ok: true,
    remote: {
      host: config.remoteSshHost,
      user: config.remoteSshUser,
      port: config.remoteSshPort,
      installDir: remoteInstallDir,
      runnerCommand: remoteRunnerPath,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
