import type { Ref } from 'vue'

import type { StartupSceneState } from '../../../composables/startup-scene'

import { expect, it } from 'vitest'
import { createApp, defineComponent, h, inject, nextTick } from 'vue'

import StartupScreenProvider from './startup-screen-provider.vue'

import { startupSceneStateKey } from '../../../composables/startup-scene'

it('shares scene state and hides loading before the next screen opens', async () => {
  let finishLoading: (() => void) | undefined
  let loadedSceneState: Ref<StartupSceneState> | undefined
  let hidden = false

  async function load(sceneState: Ref<StartupSceneState>) {
    loadedSceneState = sceneState
    await new Promise<void>((resolve) => {
      finishLoading = resolve
    })
  }

  const Scene = defineComponent({
    setup() {
      const sceneState = inject(startupSceneStateKey)
      return () => h('output', { id: 'startup-scene-state' }, sceneState?.value)
    },
  })

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(StartupScreenProvider, {
      progress: 50,
      logoSrc: '/favicon.svg',
      label: 'Loading',
      load,
      instantExit: true,
      onHidden: () => { hidden = true },
    }, { default: () => h(Scene) }),
  })

  try {
    app.mount(host)
    await expect.poll(() => document.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(document.querySelector('#startup-scene-state')?.textContent).toBe('pending')

    if (!loadedSceneState || !finishLoading)
      throw new Error('Startup loading did not begin')

    loadedSceneState.value = 'mounted'
    await nextTick()
    expect(document.querySelector('#startup-scene-state')?.textContent).toBe('mounted')
    expect(hidden).toBe(false)

    finishLoading()
    await expect.poll(() => document.querySelector('.startup-screen')).toBeNull()
    expect(hidden).toBe(true)
  }
  finally {
    finishLoading?.()
    app.unmount()
    host.remove()
  }
})
