import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter, createWebHistory, RouterView } from 'vue-router'

import { useAiriCardEditorPage } from './use-airi-card-editor-page'

it('blocks route changes until the user discards dirty card edits', async () => {
  let editorPage: ReturnType<typeof useAiriCardEditorPage> | undefined
  const editorRoute = defineComponent({
    setup() {
      editorPage = useAiriCardEditorPage()
      onMounted(() => {
        editorPage!.isDirty.value = true
      })
      return () => h('div', 'Editor')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/edit', component: editorRoute },
      { path: '/list', component: { template: '<div>List</div>' } },
    ],
  })

  await router.push('/edit')
  render(defineComponent(() => () => h(RouterView)), {
    global: {
      plugins: [router],
    },
  })

  await vi.waitFor(() => expect(editorPage?.isDirty.value).toBe(true))
  await router.push('/list')

  expect(router.currentRoute.value.path).toBe('/edit')
  expect(editorPage?.showUnsavedChangesDialog.value).toBe(true)

  editorPage?.handleDiscardChanges()
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/list'))
})

it('returns to the list without leaving a duplicate history entry', async () => {
  let editorPage: ReturnType<typeof useAiriCardEditorPage> | undefined
  const editorRoute = defineComponent({
    setup() {
      editorPage = useAiriCardEditorPage()
      return () => h('div', 'Editor')
    },
  })
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/before', component: { template: '<div>Before</div>' } },
      { path: '/settings/airi-card', component: { template: '<div>List</div>' } },
      { path: '/settings/airi-card/:cardId/edit', component: editorRoute },
    ],
  })

  await router.push('/before')
  await router.push('/settings/airi-card')
  await router.push('/settings/airi-card/card-1/edit')
  render(defineComponent(() => () => h(RouterView)), {
    global: {
      plugins: [router],
    },
  })

  await vi.waitFor(() => expect(editorPage).toBeDefined())
  editorPage?.handleBack()

  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings/airi-card'))

  router.back()
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/before'))
})
