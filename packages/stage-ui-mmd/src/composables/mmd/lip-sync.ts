import type { Profile, WLipSyncAudioNode, WLipSyncVowel } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { Ref } from 'vue'

import type { VowelSlot } from '../../constants/morphs'
import type { MorphController } from './morph'

import { createWLipSyncNode } from '@proj-airi/model-driver-lipsync/runtime/wlipsync'
import {
  createWLipSyncVowelDriver,
  WLIP_SYNC_VOWELS,
  wlipsyncProfile,
} from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { shallowRef, watch } from 'vue'

const MMD_SLOT_BY_VOWEL: Record<WLipSyncVowel, VowelSlot> = {
  A: 'vowelA',
  E: 'vowelE',
  I: 'vowelI',
  O: 'vowelO',
  U: 'vowelU',
}

/**
 * Applies shared wLipSync vowel weights to MMD mouth morphs.
 *
 * The caller owns the AudioContext and audio source lifecycle. This composable
 * owns only the connection between that source and its wLipSync node.
 * Call `update` after the MMD animation helper so lip-sync wins over VMD morphs.
 */
export function useMMDLipSync(
  audioContext: Readonly<Ref<AudioContext | undefined>>,
  audioSource: Readonly<Ref<AudioBufferSourceNode | undefined>>,
) {
  const lipSyncNode = shallowRef<WLipSyncAudioNode>()
  const vowelDriver = createWLipSyncVowelDriver()

  watch(audioContext, (context, _, onCleanup) => {
    lipSyncNode.value = undefined
    vowelDriver.reset()
    if (!context)
      return

    let active = true
    let createdNode: undefined | WLipSyncAudioNode
    onCleanup(() => {
      active = false
      createdNode?.disconnect()
    })

    void createWLipSyncNode(context, wlipsyncProfile as Profile)
      .then((node) => {
        createdNode = node
        if (!active) {
          node.disconnect()
          return
        }
        lipSyncNode.value = node
      })
      .catch((error) => {
        if (active)
          console.error('[stage-ui-mmd] Failed to create the MMD lip-sync node.', error)
      })
  }, { immediate: true })

  watch([lipSyncNode, audioSource], ([node, source], _, onCleanup) => {
    if (!node || !source)
      return

    try {
      source.connect(node)
    }
    catch (error) {
      console.error('[stage-ui-mmd] Failed to connect the MMD lip-sync node.', error)
      return
    }

    onCleanup(() => {
      try {
        source.disconnect(node)
      }
      catch {
        // The source can end before Vue runs this watcher cleanup.
      }
    })
  }, { immediate: true })

  function update(morphs: MorphController | undefined, delta = 0.016) {
    const node = lipSyncNode.value
    if (!morphs || !node)
      return

    const weights = vowelDriver.update(node, delta)
    for (const vowel of WLIP_SYNC_VOWELS)
      morphs.set(MMD_SLOT_BY_VOWEL[vowel], weights[vowel])
  }

  return { update }
}
