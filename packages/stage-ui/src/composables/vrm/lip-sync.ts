import type { VRMCore } from '@pixiv/three-vrm-core'
import type { Profile } from 'wlipsync'

import { useAsyncState } from '@vueuse/core'
import { onUnmounted, watch } from 'vue'
import { createWLipSyncNode } from 'wlipsync'

import profile from '../../assets/lip-sync-profile.json' with { type: 'json' }

import { useAudioContext } from '../../stores/audio'

export function useVRMLipSync(audioNode: AudioNode) {
  const { audioContext } = useAudioContext()
  const { state: lipSyncNode, isReady } = useAsyncState(createWLipSyncNode(audioContext, profile as Profile), undefined)

  // https://github.com/mrxz/wLipSync/blob/c3bc4b321dc7e1ca333d75f7aa1e9e746cbbb23a/example/index.js#L50-L66
  const lipSyncMap = {
    A: 'aa',
    E: 'ee',
    I: 'ih',
    O: 'oh',
    U: 'ou',
  }

  watch(isReady, () => isReady.value && audioNode.connect(lipSyncNode.value!))
  onUnmounted(() => audioNode.disconnect())

  function update(vrm: VRMCore | undefined) {
    if (!vrm?.expressionManager || !lipSyncNode.value)
      return

    for (const key of Object.keys(lipSyncNode.value.weights)) {
      const weight = lipSyncNode.value.weights[key] * lipSyncNode.value.volume
      vrm.expressionManager?.setValue(lipSyncMap[key as keyof typeof lipSyncMap], weight)
    }
  }

  return { update }
}
