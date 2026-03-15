import type { ComputerUseConfig } from '../types'

import process from 'node:process'

import { spawn } from 'node:child_process'

import { runProcess } from '../utils/process'

function quoteShell(value: string) {
  return `'${value.replaceAll(`'`, `'\\''`)}'`
}

function buildSshTarget(config: ComputerUseConfig) {
  if (!config.remoteSshHost || !config.remoteSshUser) {
    throw new Error('remote linux-x11 execution requires COMPUTER_USE_REMOTE_SSH_HOST and COMPUTER_USE_REMOTE_SSH_USER')
  }

  return `${config.remoteSshUser}@${config.remoteSshHost}`
}

export function normalizeRemoteShellPath(value: string) {
  return value.replace(/^~(?=\/|$)/, () => '$' + '{HOME}')
}

// TODO: Replace this hand-rolled SSH CLI argument builder with a maintained SSH
// client library (for example `ssh2`) when we do the remote adapter follow-up.
export function buildRemoteShellCommandArgs(config: ComputerUseConfig, command: string) {
  return [
    '-T',
    '-p',
    String(config.remoteSshPort),
    '-o',
    'BatchMode=yes',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ServerAliveCountMax=3',
    buildSshTarget(config),
    'sh',
    '-lc',
    quoteShell(command),
  ]
}

export async function runRemoteCommand(config: ComputerUseConfig, command: string, options: {
  timeoutMs?: number
  stdin?: string
} = {}) {
  return await runProcess(config.binaries.ssh, buildRemoteShellCommandArgs(config, command), {
    timeoutMs: options.timeoutMs,
    stdin: options.stdin,
    env: process.env,
  })
}

export async function uploadDirectoryToRemote(config: ComputerUseConfig, params: {
  sourceDir: string
  remoteDir: string
  timeoutMs?: number
}) {
  const remoteDir = normalizeRemoteShellPath(params.remoteDir)
  const timeoutMs = params.timeoutMs ?? 120_000

  await new Promise<void>((resolve, reject) => {
    const tar = spawn(config.binaries.tar, ['-czf', '-', '-C', params.sourceDir, '.'], {
      env: {
        ...process.env,
        COPYFILE_DISABLE: '1',
        COPY_EXTENDED_ATTRIBUTES_DISABLE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const ssh = spawn(config.binaries.ssh, buildRemoteShellCommandArgs(
      config,
      `rm -rf ${remoteDir} && mkdir -p ${remoteDir} && tar -xzf - -C ${remoteDir} && find ${remoteDir} -name '._*' -delete`,
    ), {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let tarStderr = ''
    let sshStderr = ''
    let finished = false

    const timer = setTimeout(() => {
      if (finished) {
        return
      }

      finished = true
      tar.kill('SIGTERM')
      ssh.kill('SIGTERM')
      reject(new Error(`timed out uploading ${params.sourceDir} to ${remoteDir}`))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
    }

    tar.stderr.on('data', (chunk) => {
      tarStderr += chunk.toString('utf-8')
    })
    ssh.stderr.on('data', (chunk) => {
      sshStderr += chunk.toString('utf-8')
    })

    tar.on('error', (error) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()
      ssh.kill('SIGTERM')
      reject(error)
    })

    ssh.on('error', (error) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()
      tar.kill('SIGTERM')
      reject(error)
    })

    tar.stdout.pipe(ssh.stdin)

    let tarExited = false
    let sshExited = false
    let tarCode = 0
    let sshCode = 0

    const maybeResolve = () => {
      if (finished || !tarExited || !sshExited) {
        return
      }

      finished = true
      cleanup()

      if (tarCode !== 0) {
        reject(new Error(tarStderr.trim() || `tar exited with code ${tarCode}`))
        return
      }

      if (sshCode !== 0) {
        reject(new Error(sshStderr.trim() || `ssh upload exited with code ${sshCode}`))
        return
      }

      resolve()
    }

    tar.on('close', (code) => {
      tarExited = true
      tarCode = code ?? 1
      maybeResolve()
    })

    ssh.on('close', (code) => {
      sshExited = true
      sshCode = code ?? 1
      maybeResolve()
    })
  })
}
