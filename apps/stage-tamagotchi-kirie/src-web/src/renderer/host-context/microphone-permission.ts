import type { KirieEventaContext } from '@gd-kirie/ipc-eventa'
import type { DeepReadonly, Ref } from 'vue'

import type {
  AiriMicrophonePermissionDecision,
  AiriMicrophonePermissionPromptPayload,
  AiriMicrophonePermissionState,
} from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { shallowReadonly, shallowRef } from 'vue'

import {
  airiMicrophonePermissionGetPrompt,
  airiMicrophonePermissionGetState,
  airiMicrophonePermissionPromptDismissed,
  airiMicrophonePermissionPromptRequested,
  airiMicrophonePermissionReset,
  airiMicrophonePermissionResolvePrompt,
  airiMicrophonePermissionStateChanged,
} from '../../shared/eventa'
import { initializeHostContext } from './owner'

export interface HostMicrophonePermission {
  prompt: DeepReadonly<Ref<AiriMicrophonePermissionPromptPayload | undefined>>
  status: DeepReadonly<Ref<AiriMicrophonePermissionState>>
  refresh: () => Promise<AiriMicrophonePermissionState>
  reset: () => Promise<void>
  resolvePrompt: (decision: AiriMicrophonePermissionDecision) => Promise<void>
}

function createHostMicrophonePermission(context: KirieEventaContext): HostMicrophonePermission {
  const status = shallowRef<AiriMicrophonePermissionState>('not-determined')
  const prompt = shallowRef<AiriMicrophonePermissionPromptPayload>()
  const getState = defineInvoke(context, airiMicrophonePermissionGetState)
  const getPrompt = defineInvoke(context, airiMicrophonePermissionGetPrompt)
  const resetPermission = defineInvoke(context, airiMicrophonePermissionReset)
  const resolvePrompt = defineInvoke(context, airiMicrophonePermissionResolvePrompt)

  context.on(airiMicrophonePermissionStateChanged, ({ body }) => {
    if (body?.permission === 'microphone')
      status.value = body.state
  })
  context.on(airiMicrophonePermissionPromptRequested, ({ body }) => {
    if (body?.permission === 'microphone')
      prompt.value = body
  })
  context.on(airiMicrophonePermissionPromptDismissed, ({ body }) => {
    if (body?.promptId === prompt.value?.promptId)
      prompt.value = undefined
  })

  async function refresh() {
    const [stateSnapshot, promptSnapshot] = await Promise.all([
      getState({}),
      getPrompt({}),
    ])
    status.value = stateSnapshot.state
    prompt.value = promptSnapshot.promptId
      ? { permission: 'microphone', promptId: promptSnapshot.promptId }
      : undefined
    return stateSnapshot.state
  }

  return {
    prompt: shallowReadonly(prompt),
    status: shallowReadonly(status),
    refresh,
    async reset() {
      const snapshot = await resetPermission({})
      status.value = snapshot.state
    },
    async resolvePrompt(decision) {
      const currentPrompt = prompt.value
      if (!currentPrompt)
        return

      await resolvePrompt({
        decision,
        promptId: currentPrompt.promptId,
      })
      if (prompt.value?.promptId === currentPrompt.promptId)
        prompt.value = undefined
    },
  }
}

let microphonePermission: HostMicrophonePermission | undefined
let microphonePermissionContext: KirieEventaContext | undefined

/** Returns the renderer bridge for AIRI-owned Kirie microphone permission state. */
export function useHostMicrophonePermission(): HostMicrophonePermission {
  const host = initializeHostContext()
  if (host.runtime !== 'kirie')
    throw new Error('AIRI-owned microphone permissions are only available in Kirie.')

  if (!microphonePermission || microphonePermissionContext !== host.context) {
    microphonePermission = createHostMicrophonePermission(host.context)
    microphonePermissionContext = host.context
  }

  return microphonePermission
}
