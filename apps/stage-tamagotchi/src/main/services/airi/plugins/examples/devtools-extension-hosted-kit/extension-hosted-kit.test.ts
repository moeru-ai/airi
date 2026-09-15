import type { ExtensionManifestV2 } from '@proj-airi/plugin-sdk/plugin-host'

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ExtensionHost, extensionManifestV2Schema } from '@proj-airi/plugin-sdk/plugin-host'
import { parse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

const exampleDirectory = dirname(fileURLToPath(import.meta.url))

async function readManifest(directory: string): Promise<ExtensionManifestV2> {
  const source = await readFile(join(directory, 'extension.airi.json'), 'utf8')
  return parse(extensionManifestV2Schema, JSON.parse(source))
}

describe('extension-hosted Kit example', () => {
  it('loads the self-contained lifecycle sample after folder import', async () => {
    const sampleDirectory = join(exampleDirectory, '..', 'devtools-sample-plugin')
    const manifest = await readManifest(sampleDirectory)
    const host = new ExtensionHost({ runtime: 'electron' })

    const session = await host.start(manifest, {
      cwd: sampleDirectory,
      runtime: 'electron',
    })

    expect(session.phase).toBe('ready')
  })

  it('loads the real Provider and Consumer folders, invokes the Kit, and observes Provider unload', async () => {
    const providerDirectory = join(exampleDirectory, 'provider')
    const consumerDirectory = join(exampleDirectory, 'consumer')
    const providerManifest = await readManifest(providerDirectory)
    const consumerManifest = await readManifest(consumerDirectory)
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const host = new ExtensionHost({ runtime: 'electron' })

    const providerSession = await host.start(providerManifest, {
      cwd: providerDirectory,
      runtime: 'electron',
    })
    const consumerSession = await host.start(consumerManifest, {
      cwd: consumerDirectory,
      runtime: 'electron',
    })

    expect(providerSession.phase).toBe('ready')
    expect(consumerSession.phase).toBe('ready')
    expect(consoleInfo).toHaveBeenCalledWith(
      '[devtools-agent-activity-provider] current activity',
      {
        agentId: 'codex',
        consumerExtensionId: 'devtools-agent-activity-consumer',
        kind: 'needs-input',
        summary: 'Choose a model for the example task.',
      },
    )
    expect(consoleInfo).toHaveBeenCalledWith(
      '[devtools-agent-activity-consumer] AIRI reaction',
      {
        agentId: 'codex',
        consumerExtensionId: 'devtools-agent-activity-consumer',
        kind: 'needs-input',
        summary: 'Choose a model for the example task.',
      },
    )
    await vi.waitFor(() => expect(consoleInfo).toHaveBeenCalledWith(
      '[devtools-agent-activity-consumer] AIRI reaction',
      {
        agentId: 'codex',
        consumerExtensionId: 'devtools-agent-activity-consumer',
        kind: 'completed',
        summary: 'The example task is complete.',
      },
    ))

    await host.stop(providerSession.id)

    expect(consoleInfo).toHaveBeenCalledWith(
      '[devtools-agent-activity-consumer] kit availability',
      { available: false },
    )
  })
})
