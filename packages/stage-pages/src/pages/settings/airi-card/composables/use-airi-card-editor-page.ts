import type { MaybeRefOrGetter } from 'vue'

import { computed, onMounted, onUnmounted, ref, toValue } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

interface SavedCardPayload {
  cardId: string
  activated: boolean
}

interface UseAiriCardEditorPageOptions {
  cardId?: MaybeRefOrGetter<string | undefined>
}

export function useAiriCardEditorPage(options: UseAiriCardEditorPageOptions = {}) {
  const route = useRoute()
  const router = useRouter()
  const isDirty = ref(false)
  const showUnsavedChangesDialog = ref(false)
  let pendingRoutePath = ''
  let allowLeave = false

  const initialSection = computed(() => {
    return typeof route.query.section === 'string' ? route.query.section : ''
  })

  function handleBack() {
    if (router.options.history.state.back)
      router.back()
    else
      void router.replace('/settings/airi-card')
  }

  function handleSectionChange(section: string) {
    void router.replace({
      query: {
        ...route.query,
        section,
      },
    })
  }

  onBeforeRouteLeave((to) => {
    // 分区切换只更新当前路由的查询参数，不应被未保存确认拦截。
    if (allowLeave || to.path === route.path || !isDirty.value)
      return true

    pendingRoutePath = to.fullPath
    showUnsavedChangesDialog.value = true
    return false
  })

  function handleDiscardChanges() {
    showUnsavedChangesDialog.value = false
    allowLeave = true
    // 使用 replace 完成被拦截的返回，避免在历史记录中留下重复的列表页。
    void router.replace(pendingRoutePath || '/settings/airi-card').finally(() => {
      allowLeave = false
    })
  }

  function handleCancelDiscard() {
    pendingRoutePath = ''
    showUnsavedChangesDialog.value = false
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty.value)
      return

    event.preventDefault()
    event.returnValue = ''
  }

  async function handleSaved(payload: SavedCardPayload) {
    if (toValue(options.cardId))
      return

    await router.replace({
      path: `/settings/airi-card/${encodeURIComponent(payload.cardId)}/edit`,
      query: route.query,
    })
  }

  onMounted(() => {
    if (typeof window !== 'undefined')
      window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined')
      window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  return {
    isDirty,
    showUnsavedChangesDialog,
    initialSection,
    handleBack,
    handleSectionChange,
    handleDiscardChanges,
    handleCancelDiscard,
    handleSaved,
  }
}
