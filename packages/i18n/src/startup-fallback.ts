interface StartupFallbackMessages {
  stage?: { startup?: { failed?: string, retry?: string } }
  settings?: { dialogs?: { onboarding?: { retry?: string } } }
}

/** Serializes boot error labels for the inline splash that runs before Vue. */
export function serializeStartupFallbackLocales(locales: Record<string, StartupFallbackMessages>, localeRemap: Record<string, string>): string {
  const english = locales.en?.stage?.startup
  if (!english?.failed || !english.retry)
    throw new Error('English startup error labels are required')

  const labels = Object.fromEntries(Object.entries(locales).map(([locale, messages]) => [locale, {
    failed: messages.stage?.startup?.failed ?? english.failed,
    retry: messages.stage?.startup?.retry ?? messages.settings?.dialogs?.onboarding?.retry ?? english.retry,
  }]))

  return JSON.stringify({ labels, localeRemap }).replaceAll('<', '\\u003c')
}
