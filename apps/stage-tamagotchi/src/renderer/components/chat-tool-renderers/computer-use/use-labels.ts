import { useI18n } from 'vue-i18n'

/** The copy of the computer use cards. */
export function useComputerUseLabels() {
  const { t, te, locale } = useI18n()
  const KEY = 'tamagotchi.stage.computer-use-tool-call'

  // AUV can add states, paths, and other names. A name without words here shows as AUV writes it.
  function label(group: string, value: string) {
    return te(`${KEY}.${group}.${value}`) ? t(`${KEY}.${group}.${value}`) : value
  }

  return { t, locale, KEY, label }
}
