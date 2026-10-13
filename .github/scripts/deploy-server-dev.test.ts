import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(import.meta.dirname, 'deploy-server-dev.sh')
const temporaryDirectories: string[] = []

function fixture(commands: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'deploy-server-dev-'))
  const binaryDirectory = join(directory, 'bin')
  temporaryDirectories.push(directory)

  mkdirSync(binaryDirectory)
  for (const [name, source] of Object.entries(commands)) {
    const path = join(binaryDirectory, name)
    writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${source}`)
    chmodSync(path, 0o755)
  }

  return {
    directory,
    run(command: string) {
      return spawnSync('bash', [script, command], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DEPLOY_BRANCH: 'main',
          GH_REPOSITORY: 'moeru-ai/airi',
          PATH: `${binaryDirectory}:${process.env.PATH}`,
          POLL_INTERVAL_SECONDS: '0',
          TEST_STATE_DIRECTORY: directory,
        },
      })
    },
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('deploy-server-dev', () => {
  // https://github.com/moeru-ai/airi/pull/2918#discussion_r4245224726
  // ROOT CAUSE:
  //
  // The workflow did not treat REMOVED as a terminal failure.
  // The deployment wait now fails for every unsuccessful terminal status.
  it('Issue PR #2918 fails when a new Railway deployment is removed', () => {
    const { run } = fixture({
      railway: `
if [[ "$1 $2" == "service status" ]]; then
  printf '{"id":"service-id","deploymentId":"old","status":"SUCCESS"}\n'
  exit 0
fi
if [[ "$1 $2" == "environment list" ]]; then
  printf '{"environments":[{"id":"environment-id","isLinked":true}]}\n'
  exit 0
fi
if [[ "$1" == "api" ]]; then
  printf '{"data":{"serviceInstanceDeploy":"new"}}\n'
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  printf '[{"id":"new","status":"REMOVED"}]\n'
  exit 0
fi
exit 1
`,
      sleep: 'exit 0',
    })

    const result = run('deploy-services')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ended with status REMOVED')
  })

  // https://github.com/moeru-ai/airi/pull/2918#discussion_r4248346084
  // ROOT CAUSE:
  //
  // The workflow started both deployments before it waited for either deployment.
  // The deployment command now waits for one service before it starts the next service.
  it('Issue PR #2918 waits for each service before it starts the next service', () => {
    const { directory, run } = fixture({
      railway: `
service=''
for ((index = 1; index <= $#; index++)); do
  if [[ "\${!index}" == '--service' ]]; then
    next=$((index + 1))
    service="\${!next}"
  fi
done
printf '%s %s %s\n' "$1" "$2" "$service" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "service status" ]]; then
  printf '{"id":"service-%s","deploymentId":"old-%s","status":"SUCCESS"}\n' "$service" "$service"
  exit 0
fi
if [[ "$1 $2" == "environment list" ]]; then
  printf '{"environments":[{"id":"environment-id","isLinked":true}]}\n'
  exit 0
fi
if [[ "$1" == "api" ]]; then
  if [[ "$*" == *'service-ts-api'* ]]; then
    printf '{"data":{"serviceInstanceDeploy":"new-ts-api"}}\n'
  else
    printf '{"data":{"serviceInstanceDeploy":"new-auth-server"}}\n'
  fi
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  printf '[{"id":"new-%s","status":"SUCCESS"}]\n' "$service"
  exit 0
fi
exit 1
`,
      sleep: 'exit 0',
    })

    const result = run('deploy-services')
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(0)
    const tsApiWait = calls.indexOf('deployment list ts-api', calls.indexOf('api mutation'))
    expect(tsApiWait).toBeLessThan(calls.lastIndexOf('service status auth-server'))
  })

  it('waits for the deployment ID returned by Railway', () => {
    const { directory, run } = fixture({
      railway: `
service=''
for ((index = 1; index <= $#; index++)); do
  if [[ "\${!index}" == '--service' ]]; then
    next=$((index + 1))
    service="\${!next}"
  fi
done
if [[ "$1 $2" == "service status" ]]; then
  printf '{"id":"service-%s","deploymentId":"old","status":"SUCCESS"}\n' "$service"
  exit 0
fi
if [[ "$1 $2" == "environment list" ]]; then
  printf '{"environments":[{"id":"environment-id","isLinked":true}]}\n'
  exit 0
fi
if [[ "$1" == "api" ]]; then
  if [[ "$*" == *'service-ts-api'* ]]; then
    printf '{"data":{"serviceInstanceDeploy":"target-ts-api"}}\n'
  else
    printf '{"data":{"serviceInstanceDeploy":"target-auth-server"}}\n'
  fi
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  count_file="$TEST_STATE_DIRECTORY/list-$service"
  count=$(cat "$count_file" 2>/dev/null || printf '0')
  printf '%s' "$((count + 1))" > "$count_file"
  if [[ "$count" == '0' ]]; then
    printf '[{"id":"unrelated-%s","status":"SUCCESS"},{"id":"target-%s","status":"BUILDING"}]\n' "$service" "$service"
  else
    printf '[{"id":"unrelated-%s","status":"SUCCESS"},{"id":"target-%s","status":"SUCCESS"}]\n' "$service" "$service"
  fi
  exit 0
fi
exit 1
`,
      sleep: 'exit 0',
    })

    const result = run('deploy-services')

    expect(result.status).toBe(0)
    expect(readFileSync(join(directory, 'list-ts-api'), 'utf8')).toBe('2')
    expect(readFileSync(join(directory, 'list-auth-server'), 'utf8')).toBe('2')
  })

  // https://github.com/moeru-ai/airi/pull/2918#discussion_r4246985823
  // ROOT CAUSE:
  //
  // The database reset happened before the workflow disconnected the old source branch.
  // The workflow now changes both sources and drains old deployments before the reset.
  it('Issue PR #2918 changes both source branches before it drains deployments', () => {
    const { directory, run } = fixture({
      railway: `
service=''
for ((index = 1; index <= $#; index++)); do
  if [[ "\${!index}" == '--service' || "\${!index}" == '--service-config' ]]; then
    next=$((index + 1))
    service="\${!next}"
  fi
done
printf '%s %s %s\n' "$1" "$2" "$service" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "environment edit" ]]; then
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  count_file="$TEST_STATE_DIRECTORY/list-$service"
  count=$(cat "$count_file" 2>/dev/null || printf '0')
  printf '%s' "$((count + 1))" > "$count_file"
  if [[ "$count" == '0' ]]; then
    printf '[{"status":"BUILDING"}]\n'
  else
    printf '[{"status":"SUCCESS"}]\n'
  fi
  exit 0
fi
exit 1
`,
      sleep: 'exit 0',
    })

    const result = run('select-branch')
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(0)
    expect(calls.indexOf('environment edit auth-server')).toBeLessThan(calls.indexOf('deployment list ts-api'))
  })

  it('removes sleeping Railway deployments before it finishes draining', () => {
    const { directory, run } = fixture({
      railway: `
service=''
for ((index = 1; index <= $#; index++)); do
  if [[ "\${!index}" == '--service' || "\${!index}" == '--service-config' ]]; then
    next=$((index + 1))
    service="\${!next}"
  fi
done
printf '%s %s %s\n' "$1" "\${2:-}" "$service" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "environment edit" ]]; then
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  if [[ -f "$TEST_STATE_DIRECTORY/removed-$service" ]]; then
    printf '[{"status":"REMOVED"}]\n'
  else
    printf '[{"status":"SLEEPING"}]\n'
  fi
  exit 0
fi
if [[ "$1" == "down" ]]; then
  touch "$TEST_STATE_DIRECTORY/removed-$service"
  exit 0
fi
exit 1
`,
      sleep: 'exit 0',
    })

    const result = run('select-branch')
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(0)
    expect(calls).toContain('down --service ts-api')
    expect(calls).toContain('down --service auth-server')
  })

  it('stops before reset when a Railway deployment needs approval', () => {
    const { run } = fixture({
      railway: `
if [[ "$1 $2" == "environment edit" ]]; then
  exit 0
fi
if [[ "$1 $2" == "deployment list" ]]; then
  printf '[{"status":"NEEDS_APPROVAL"}]\n'
  exit 0
fi
exit 1
`,
    })

    const result = run('select-branch')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('needs approval')
  })

  it('does not drain another service after one service fails to drain', () => {
    const { directory, run } = fixture({
      railway: `
service=''
for ((index = 1; index <= $#; index++)); do
  if [[ "\${!index}" == '--service' || "\${!index}" == '--service-config' ]]; then
    next=$((index + 1))
    service="\${!next}"
  fi
done
printf '%s %s %s\n' "$1" "\${2:-}" "$service" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "environment edit" ]]; then
  exit 0
fi
if [[ "$1 $2" == "deployment list" && "$service" == "ts-api" ]]; then
  printf '[{"status":"NEEDS_APPROVAL"}]\n'
  exit 0
fi
if [[ "$1 $2" == "deployment list" && "$service" == "auth-server" ]]; then
  if [[ -f "$TEST_STATE_DIRECTORY/auth-server-removed" ]]; then
    printf '[{"status":"REMOVED"}]\n'
  else
    printf '[{"status":"SLEEPING"}]\n'
  fi
  exit 0
fi
if [[ "$1" == "down" ]]; then
  touch "$TEST_STATE_DIRECTORY/auth-server-removed"
  exit 0
fi
exit 1
`,
    })

    const result = run('select-branch')
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(1)
    expect(calls).not.toContain('deployment list auth-server')
    expect(calls).not.toContain('down --service auth-server')
  })

  // https://github.com/moeru-ai/airi/pull/2918#discussion_r4245224721
  // ROOT CAUSE:
  //
  // The dispatch command returned before the frontend workflow completed.
  // The workflow now reads the child run ID and propagates its final result.
  it('Issue PR #2918 waits for the exact frontend run', () => {
    const { directory, run } = fixture({
      gh: `
printf '%s\n' "$*" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "workflow run" ]]; then
  printf 'https://github.com/moeru-ai/airi/actions/runs/12345\n'
  exit 0
fi
if [[ "$1 $2" == "run watch" ]]; then
  exit 0
fi
exit 1
`,
    })

    const result = run('deploy-frontend')
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(0)
    expect(calls).toContain('run watch 12345 --repo moeru-ai/airi --exit-status --compact')
  })

  it('finds the exact frontend run when dispatch returns no URL', () => {
    const { directory } = fixture({
      gh: `
printf '%s\n' "$*" >> "$TEST_STATE_DIRECTORY/calls"
if [[ "$1 $2" == "workflow run" ]]; then
  exit 0
fi
if [[ "$1 $2" == "run list" ]]; then
  printf '[{"databaseId":67890,"displayTitle":"Deploy server-dev frontend (server-dev-42-3)"}]\n'
  exit 0
fi
if [[ "$1 $2" == "run watch" ]]; then
  exit 0
fi
exit 1
`,
    })

    const result = spawnSync('bash', [script, 'deploy-frontend'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_BRANCH: 'release-branch',
        GH_REPOSITORY: 'moeru-ai/airi',
        GITHUB_REF_NAME: 'main',
        GITHUB_RUN_ATTEMPT: '3',
        GITHUB_RUN_ID: '42',
        PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
        POLL_INTERVAL_SECONDS: '0',
        TEST_STATE_DIRECTORY: directory,
      },
    })
    const calls = readFileSync(join(directory, 'calls'), 'utf8')

    expect(result.status).toBe(0)
    expect(calls).toContain('workflow run deploy-cloudflare-workers-dev-server.yml --repo moeru-ai/airi --ref main --raw-field branch=release-branch')
    expect(calls).toContain('run watch 67890 --repo moeru-ai/airi --exit-status --compact')
  })
})
