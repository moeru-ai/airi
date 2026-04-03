import { useData } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const EDIT_LINK_PATH_RE = /:path/g

export function useEditLink() {
  const { theme, page } = useData()
  const { t } = useI18n()

  return computed(() => {
    const { text = t('docs.theme.doc.community.edit.title'), pattern = '' } = theme.value.editLink || {}
    let url: string
    if (typeof pattern === 'function') {
      url = pattern(page.value)
    }
    else {
      url = pattern.replace(EDIT_LINK_PATH_RE, page.value.filePath)
    }

    return { url, text }
  })
}
