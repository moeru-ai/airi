import type { AreaCopy } from '../../components/release-copy'

/**
 * The text of each v0.13 release area.
 * Keep each area to one idea. Details belong in the release notes.
 */
export const releaseCopy = {
  settingsSearch: {
    eyebrow: 'Settings',
    title: [{ text: 'Find ' }, { text: 'any setting', accent: true }, { text: ' in seconds' }],
    lead: 'Search settings pages, the settings on them, and your own cards, models, voices, and memories.',
    points: [
      { strong: 'Opens at the row:', text: 'AIRI scrolls to the setting and highlights it' },
      { text: 'Arrow keys move through the results' },
      { text: 'Cmd+F or Ctrl+F focuses the search' },
    ],
  },
  needsAttention: {
    eyebrow: 'Settings',
    title: [{ text: 'Know ' }, { text: 'why', accent: true }, { text: ' something is off' }],
    lead: 'The settings home lists what keeps a feature you use from working, and tells you why.',
    points: [
      { strong: 'Providers', text: 'that failed their check, or are not set up' },
      { strong: 'Characters', text: 'with no speech model or voice' },
      { strong: 'Voice input', text: 'with nothing to transcribe it' },
      { strong: 'Edit', text: 'opens the exact setting to change' },
    ],
  },
  desktopUpdates: {
    eyebrow: 'Desktop',
    title: [{ text: 'Updates ' }, { text: 'over the air', accent: true }],
    lead: 'Most updates now download without a new installer. AIRI applies them with a reload or a restart.',
    points: [
      { strong: 'Safe:', text: 'a version that does not start correctly rolls back' },
      { strong: 'Channels:', text: 'Stable, Beta, Nightly, and a new dev channel' },
      { text: 'Steam, Flatpak, and Nix keep updating through their store' },
    ],
  },
  fixes: {
    eyebrow: 'Also in v0.13',
    title: [{ text: 'Search the web with ' }, { text: 'DeepSeek', accent: true }],
    lead: 'Pick DeepSeek next to Tavily for web search. Any chat model that can call tools can use it.',
  },
} satisfies Record<string, AreaCopy>
