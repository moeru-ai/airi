import type { AudioPlayback, PlaybackClip } from '@proj-airi/pipelines-audio'

/**
 * Serializes the first clip of each playback group against the previous group.
 *
 * `Playback` keeps each group's queue independent. Voice responses open one
 * group per turn, so two responses can otherwise start together.
 */
export function createSerializedPlayback<TNode = never>(inner: AudioPlayback<TNode>): AudioPlayback<TNode> {
  let gate: Promise<void> = Promise.resolve()

  return {
    nowMs: () => inner.nowMs(),
    output: inner.output,
    connect: inner.connect,
    openGroup(label: string) {
      const group = inner.openGroup(label)
      let acquired = false
      let released = false
      let releaseGate: (() => void) | undefined

      const release = () => {
        if (released)
          return
        released = true
        releaseGate?.()
      }

      return {
        id: group.id,
        label: group.label,
        async enqueue(clip: PlaybackClip) {
          if (!acquired && !released) {
            acquired = true
            const previous = gate
            gate = new Promise<void>((resolve) => {
              releaseGate = resolve
            })
            await previous
          }
          return group.enqueue(clip)
        },
        async finish() {
          try {
            return await group.finish()
          }
          finally {
            release()
          }
        },
        async stop(options: { fadeMs: number }) {
          try {
            return await group.stop(options)
          }
          finally {
            release()
          }
        },
      }
    },
  }
}
