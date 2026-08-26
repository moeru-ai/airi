import type { ComputerUseConfig } from '../types'

import process from 'node:process'

import { spawn } from 'node:child_process'

import { runProcess } from '../utils/process'

const HOME_PREFIX_RE = /^~(?=\/|$)/

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
    command,
  ]
}

export function normalizeRemoteShellPath(value: string) {
  return value.replace(HOME_PREFIX_RE, '$HOME')
}

export async function runRemoteCommand(config: ComputerUseConfig, command: string, options: {
  stdin?: string
  timeoutMs?: number
} = {}) {
  return await runProcess(config.binaries.ssh, buildRemoteShellCommandArgs(config, command), {
    env: process.env,
    stdin: options.stdin,
    timeoutMs: options.timeoutMs,
  })
}

export async function uploadDirectoryToRemote(config: ComputerUseConfig, params: {
  remoteDir: string
  sourceDir: string
  timeoutMs?: number
}) {
  const remoteDir = normalizeRemoteShellPath(params.remoteDir)
  const timeoutMs = params.timeoutMs ?? 120_000

  await new Promise<void>((resolve, reject) => {
    const tar = spawn(config.binaries.tar, ['-czf', '-', '-C', params.sourceDir, '.'], {
      env: {
        ...process.env,
        COPY_EXTENDED_ATTRIBUTES_DISABLE: '1',
        COPYFILE_DISABLE: '1',
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

function buildSshTarget(config: ComputerUseConfig) {
  if (!config.remoteSshHost || !config.remoteSshUser) {
    throw new Error('remote linux-x11 execution requires COMPUTER_USE_REMOTE_SSH_HOST and COMPUTER_USE_REMOTE_SSH_USER')
  }

  return `${config.remoteSshUser}@${config.remoteSshHost}`
}
