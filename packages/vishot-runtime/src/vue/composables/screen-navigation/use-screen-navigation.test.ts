import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useSceneNavigation } from './use-screen-navigation'

const scenes = [
  { id: 'intro-chat', title: 'Intro Chat' },
  { id: 'intro-websocket', title: 'Intro WebSocket' },
  { id: 'settings-only', title: 'Settings Only' },
]

describe('useSceneNavigation', () => {
  it('derives active, prev, and next scenes from current id', () => {
    const currentSceneId = ref('intro-websocket')
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: () => {},
    })

    expect(nav.activeScene.value?.id).toBe('intro-websocket')
    expect(nav.canGoPrev.value).toBe(true)
    expect(nav.canGoNext.value).toBe(true)
    expect(nav.prevScene.value?.id).toBe('intro-chat')
    expect(nav.nextScene.value?.id).toBe('settings-only')
  })

  it('returns unknown active scene fallback when current id is not in registry', () => {
    const currentSceneId = ref('missing')
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: () => {},
    })

    expect(nav.activeScene.value).toBeUndefined()
    expect(nav.activeSceneLabel.value).toBe('Unknown scene')
    expect(nav.canGoPrev.value).toBe(false)
    expect(nav.canGoNext.value).toBe(false)
  })

  it('filters by query and keeps active scene first in palette items', () => {
    const currentSceneId = ref('intro-websocket')
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: () => {},
    })

    nav.searchQuery.value = 'intro'
    expect(nav.filteredScenes.value.map(scene => scene.id)).toEqual(['intro-chat', 'intro-websocket'])
    expect(nav.paletteItems.value[0]?.id).toBe('intro-websocket')
  })

  it('invokes onNavigate with selected scene id', () => {
    const currentSceneId = ref('intro-chat')
    const calls: string[] = []
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: id => calls.push(id),
    })

    nav.goToScene('settings-only')
    expect(calls).toEqual(['settings-only'])
  })

  it('goes to the previous scene when available', () => {
    const currentSceneId = ref('intro-websocket')
    const calls: string[] = []
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: id => calls.push(id),
    })

    nav.goPrev()
    expect(calls).toEqual(['intro-chat'])
  })

  it('goes to the next scene when available', () => {
    const currentSceneId = ref('intro-websocket')
    const calls: string[] = []
    const nav = useSceneNavigation({
      scenes,
      currentSceneId,
      onNavigate: id => calls.push(id),
    })

    nav.goNext()
    expect(calls).toEqual(['settings-only'])
  })

  it('does not navigate backward at the first scene or forward at the last scene', () => {
    const firstSceneCalls: string[] = []
    const firstSceneNav = useSceneNavigation({
      scenes,
      currentSceneId: ref('intro-chat'),
      onNavigate: id => firstSceneCalls.push(id),
    })

    firstSceneNav.goPrev()
    expect(firstSceneCalls).toEqual([])

    const lastSceneCalls: string[] = []
    const lastSceneNav = useSceneNavigation({
      scenes,
      currentSceneId: ref('settings-only'),
      onNavigate: id => lastSceneCalls.push(id),
    })

    lastSceneNav.goNext()
    expect(lastSceneCalls).toEqual([])
  })
})
