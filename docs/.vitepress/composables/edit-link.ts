import { useData } from 'vitepress'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export function useEditLink() {
  const { page, theme } = useData()
  const { t } = useI18n()

  return computed(() => {
    const { pattern = '', text = t('docs.theme.doc.community.edit.title') } = theme.value.editLink || {}
    let url: string
    if (typeof pattern === 'function') {
      url = pattern(page.value)
    }
    else {
      url = pattern.replace(/:path/g, page.value.filePath)
    }

    return { text, url }
  })
}
