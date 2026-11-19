import type { AreaCopy } from '../../components/release-copy'

/**
 * The text of each release area. The areas read it in this order: eyebrow, title, lead, points, chips.
 * Keep each area to one idea. Details belong in the release notes.
 */
export const releaseCopy = {
  avatars: {
    eyebrow: 'Characters',
    title: [{ text: 'Bring ' }, { text: 'any', accent: true }, { text: ' character to the stage' }],
    lead: 'The desktop app now loads MMD models and Tachie image sets, next to Live2D and VRM.',
    points: [
      { strong: 'MMD:', text: 'motions, physics, gaze, lip sync, materials' },
      { strong: 'Tachie:', text: 'full images that switch with emotions' },
      { strong: 'VRM:', text: 'click reactions and a frame-rate cap' },
    ],
  },
  live2d: {
    eyebrow: 'Live2D',
    title: [{ text: 'Live2D gets ' }, { text: 'MAGIC', accent: true }],
    lead: 'Pick the MAGIC driver for lively idle and speaking motion. Lip sync and eye contact stay in control.',
    points: [
      { strong: 'Per character:', text: 'motion and expression settings' },
      { strong: 'Report before import:', text: 'missing files and fixes' },
      { text: 'macOS ZIPs, CJK paths, and old encodings import correctly' },
    ],
  },
  toolCalls: {
    eyebrow: 'Chat',
    title: [{ text: 'Tool calls you can ' }, { text: 'actually read', accent: true }],
    lead: 'Each call shows what the tool does and why the model used it. Results can show as widgets.',
    points: [
      { strong: 'Combo pills', text: 'group the calls of one reply' },
      { text: 'The model picks an icon for each call' },
      { text: 'Widgets for web search and Home Assistant' },
    ],
  },
  voice: {
    eyebrow: 'Voice',
    title: [{ text: 'Say the wake word. ' }, { text: 'AIRI listens.', accent: true }],
    lead: 'Each character keeps its own wake words. A chat model decides when you finished, so a short pause does not cut you off.',
    points: [
      { strong: 'Live transcripts', text: 'and push to talk in every composer' },
      { strong: 'Voiceprint:', text: 'AIRI can tell who is speaking' },
    ],
    chips: ['Sherpaw', 'Apple Speech', 'VOICEVOX', 'AivisSpeech', 'MiniMax Speech'],
  },
  desktop: {
    eyebrow: 'Desktop',
    title: [{ text: 'Lives on ' }, { text: 'your desktop', accent: true }],
    points: [
      { strong: 'Floating chat', text: 'with a danmaku feed that can hide read messages' },
      { strong: 'Computer use', text: 'through AUV, when you allow it' },
      { strong: 'Home Assistant', text: 'and remote MCP servers' },
      { text: 'Clicks pass through empty areas. Tray-only mode.' },
    ],
  },
  webMobile: {
    eyebrow: 'Web and mobile',
    title: [{ text: 'Same character, ' }, { text: 'every screen', accent: true }],
    points: [
      { strong: 'New mobile layout:', text: 'Stage bar, view mode, volume, settings drawer' },
      { text: 'Long-press the input to dock it as a bubble' },
      { text: 'The keyboard no longer hides the chat input' },
      { text: 'Sign-in opens in the system browser, then returns' },
    ],
  },
  stickers: {
    eyebrow: 'Chat',
    title: [{ text: 'Replies with ' }, { text: 'feelings', accent: true }],
    lead: 'Characters can answer with a sticker that matches their mood. Import your own and tag each one by emotion.',
    points: [
      { strong: 'Images in chat:', text: 'vision models see them, others get a description' },
      { strong: 'Skills and long-term memory,', text: 'and background tasks' },
      { text: 'Automatic retries after a short provider outage' },
    ],
    chips: ['Off by default', 'Settings → Modules → Stickers'],
  },
} satisfies Record<string, AreaCopy>
