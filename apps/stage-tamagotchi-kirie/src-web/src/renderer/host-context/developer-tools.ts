import type { OpenDevtoolsWindowPayload } from '../../shared/eventa'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { electronOpenDevtoolsWindow, electronOpenEditor, electronOpenMainDevtools } from '../../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieOpenMainDevtools = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronOpenMainDevtools.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieOpenEditor = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronOpenEditor.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieOpenDevtoolsWindow = defineInvokeEventa<EmptyPayload, OpenDevtoolsWindowPayload>(
  electronOpenDevtoolsWindow.sendEvent.id.slice(0, -sendSuffix.length),
)

export interface HostDeveloperTools {
  openEditor: () => Promise<void>
  openWebInspector: () => Promise<void>
  openWindow: (payload: OpenDevtoolsWindowPayload) => Promise<void>
}

export function useHostDeveloperTools(): HostDeveloperTools {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    const openEditor = defineInvoke(host.context, electronOpenEditor)
    const openWebInspector = defineInvoke(host.context, electronOpenMainDevtools)
    const openWindow = defineInvoke(host.context, electronOpenDevtoolsWindow)
    return {
      async openEditor() {
        await openEditor()
      },
      async openWebInspector() {
        await openWebInspector()
      },
      async openWindow(payload) {
        await openWindow(payload)
      },
    }
  }

  const openEditor = defineInvoke(host.context, kirieOpenEditor)
  const openWebInspector = defineInvoke(host.context, kirieOpenMainDevtools)
  const openWindow = defineInvoke(host.context, kirieOpenDevtoolsWindow)
  return {
    async openEditor() {
      await openEditor({})
    },
    async openWebInspector() {
      await openWebInspector({})
    },
    async openWindow(payload) {
      await openWindow(payload)
    },
  }
}
