import { JUDGE_RECIPE_TOOL_NAME } from './judge-recipe'
import { FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'
import { PROPOSE_RECIPE_TOOL_NAME } from './propose-recipe'
import { SEARCH_ICONS_TOOL_NAME } from './search-icons'
import { USE_RECIPE_TOOL_NAME } from './use-recipe'

// UnoCSS generates an icon only for a class that a scanned file writes out. Every app scans stage-ui, but only some of
// its own folders. So every tool icon class lives here, and a tool registration refers to one of these values.

/** The icon of each kind of skill. The skills settings page and the chat show the same icons. */
export const SKILL_ICONS = {
  instructions: 'i-tabler:file-text',
  decision: 'i-tabler:git-branch',
} as const

/**
 * Tabler outline icons, as are the icons that the model picks for each call, so a row of tool icons uses one set. Each
 * value draws the same thing as the icon of the feature in Settings or in the chat composer.
 */
export const TOOL_ICONS = {
  weather: 'i-tabler:cloud-rain',
  widgets: 'i-tabler:layout-grid',
  imageJournal: 'i-tabler:palette',
  computerUse: 'i-tabler:device-desktop',
  homeAssistant: 'i-tabler:home',
  memory: 'i-tabler:book-2',
  wakeWords: 'i-tabler:microphone',
  spark: 'i-tabler:send',
  /** A search, for example of the icons that a card names. */
  search: 'i-tabler:search',
  /** Every tool that an MCP server provides. */
  mcp: 'i-tabler:server',
  /** Every tool of the skills feature that has no kind of its own. */
  skill: SKILL_ICONS.instructions,
  /** A tool that matches nothing else. */
  generic: 'i-tabler:wand',
} as const

/** Tools that stage-ui and core-agent create for each send. They never enter the tool registry, so their icons live here. */
const SEND_TOOL_ICONS: Record<string, string> = {
  [USE_RECIPE_TOOL_NAME]: TOOL_ICONS.skill,
  [PROPOSE_RECIPE_TOOL_NAME]: TOOL_ICONS.skill,
  [JUDGE_RECIPE_TOOL_NAME]: SKILL_ICONS.decision,
  [READ_MEMORY_TOOL_NAME]: TOOL_ICONS.memory,
  [WRITE_MEMORY_TOOL_NAME]: TOOL_ICONS.memory,
  [FORGET_MEMORY_TOOL_NAME]: TOOL_ICONS.memory,
  configure_wake_words: TOOL_ICONS.wakeWords,
  [SEARCH_ICONS_TOOL_NAME]: TOOL_ICONS.search,
  builtIn_mcpListTools: TOOL_ICONS.mcp,
  builtIn_mcpCallTool: TOOL_ICONS.mcp,
  builtIn_emitSparkCommand: TOOL_ICONS.spark,
  builtIn_sparkCommand: TOOL_ICONS.spark,
  builtIn_sparkNoResponse: TOOL_ICONS.spark,
}

/**
 * The icon of a tool call.
 *
 * Precedence:
 * 1. `registeredIcon`: the icon that the tool's registration declares. The registration knows the tool best.
 * 2. A tool that stage-ui or core-agent creates for each send. It has no registration, so its icon is listed above.
 * 3. {@link TOOL_ICONS.generic}, for a tool that declares nothing, or that is no longer registered.
 */
export function toolIconOf(toolName: string, registeredIcon: string | undefined) {
  return registeredIcon ?? SEND_TOOL_ICONS[toolName] ?? TOOL_ICONS.generic
}
