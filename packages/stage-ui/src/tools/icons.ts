import { JUDGE_RECIPE_TOOL_NAME } from './judge-recipe'
import { FORGET_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME, WRITE_MEMORY_TOOL_NAME } from './memory'
import { PROPOSE_RECIPE_TOOL_NAME } from './propose-recipe'
import { USE_RECIPE_TOOL_NAME } from './use-recipe'

// UnoCSS generates an icon only when its class appears literally in a file that it scans. Every app scans stage-ui,
// but an app scans only some of its own folders. So every tool icon class lives here, and a tool registration
// refers to one of these values instead of writing a class of its own.

/** The icon of each kind of skill. The skills settings page and the chat show the same icons. */
export const SKILL_ICONS = {
  instructions: 'i-mingcute:document-fill',
  decision: 'i-mingcute:git-branch-fill',
} as const

/** Each value matches the icon that the same feature shows in Settings or in the chat composer, in the MingCute set. */
export const TOOL_ICONS = {
  weather: 'i-mingcute:sun-cloudy-fill',
  widgets: 'i-mingcute:layout-4-fill',
  imageJournal: 'i-mingcute:palette-fill',
  computerUse: 'i-mingcute:monitor-fill',
  homeAssistant: 'i-mingcute:home-4-fill',
  memory: 'i-mingcute:book-2-fill',
  wakeWords: 'i-mingcute:mic-fill',
  spark: 'i-mingcute:send-plane-fill',
  /** Every tool that an MCP server provides. */
  mcp: 'i-mingcute:server-fill',
  /** Every tool of the skills feature that has no kind of its own. */
  skill: SKILL_ICONS.instructions,
  /** A tool that matches nothing else. */
  generic: 'i-mingcute:magic-2-fill',
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
