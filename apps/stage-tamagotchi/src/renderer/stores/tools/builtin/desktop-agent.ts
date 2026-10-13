import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { rawTool } from '@xsai/tool'

import { createExecutor } from '../../../../main/services/airi/desktop-agent/executor'
import {
  desktopAgentCursor,
  desktopAgentExec,
  desktopAgentFsList,
  desktopAgentFsRead,
  desktopAgentFsWrite,
  desktopAgentGetWorkspace,
  desktopAgentKeyboardPress,
  desktopAgentKeyboardType,
  desktopAgentMouseClick,
  desktopAgentMouseMove,
  desktopAgentOpen,
  desktopAgentScreenshot,
  desktopAgentWindowFocus,
  desktopAgentWindowList,
} from '../../../../shared/eventa/desktop-agent'

/**
 * The names the model sees for the desktop agent tools.
 *
 * The list is written out because the request needs plain names, and the
 * permission layer classifies each one by name.
 */
export const desktopAgentToolReferences = [
  { name: 'desktop_list_files' },
  { name: 'desktop_search_files' },
  { name: 'desktop_read_file' },
  { name: 'desktop_write_file' },
  { name: 'desktop_apply_patch' },
  { name: 'desktop_run_command' },
  { name: 'desktop_screen_capture' },
  { name: 'desktop_window_list' },
  { name: 'desktop_window_focus' },
  { name: 'desktop_open_application' },
  { name: 'desktop_mouse_move' },
  { name: 'desktop_mouse_click' },
  { name: 'desktop_keyboard_type' },
  { name: 'desktop_keyboard_press' },
] as const

function createInvokers() {
  const { context } = createContext(window.electron.ipcRenderer)
  return {
    list: defineInvoke(context, desktopAgentFsList),
    read: defineInvoke(context, desktopAgentFsRead),
    write: defineInvoke(context, desktopAgentFsWrite),
    exec: defineInvoke(context, desktopAgentExec),
    screenshot: defineInvoke(context, desktopAgentScreenshot),
    windowList: defineInvoke(context, desktopAgentWindowList),
    windowFocus: defineInvoke(context, desktopAgentWindowFocus),
    open: defineInvoke(context, desktopAgentOpen),
    cursor: defineInvoke(context, desktopAgentCursor),
    mouseMove: defineInvoke(context, desktopAgentMouseMove),
    mouseClick: defineInvoke(context, desktopAgentMouseClick),
    keyboardType: defineInvoke(context, desktopAgentKeyboardType),
    keyboardPress: defineInvoke(context, desktopAgentKeyboardPress),
  }
}

type Invokers = ReturnType<typeof createInvokers>
let invokeCache: Invokers | undefined

function invokers(): Invokers {
  if (!invokeCache)
    invokeCache = createInvokers()

  return invokeCache
}

/**
 * The workspace in force. The host stores it, and the panel edits it.
 *
 * The value is fetched on the first tool call, because the tools register while
 * the window opens and the host answers the lookup then.
 */
let currentWorkspace = ''
let workspaceRequest: Promise<string> | undefined

export function setDesktopAgentWorkspace(workspace: string): void {
  currentWorkspace = workspace
}

async function resolveWorkspace(): Promise<string> {
  if (currentWorkspace)
    return currentWorkspace

  workspaceRequest ??= defineInvoke(
    createContext(window.electron.ipcRenderer).context,
    desktopAgentGetWorkspace,
  )().then((result) => {
    currentWorkspace = result.workspace
    return result.workspace
  })

  return await workspaceRequest
}

/** One executor per workspace, so a workspace change rebuilds the boundary. */
let executorCache: { workspace: string, executor: ReturnType<typeof createExecutor> } | undefined

/**
 * Builds the executor that the tools call.
 *
 * The executor owns the command policy, the workspace boundary, and the limits.
 * Its bridge forwards each capability to the host, which checks the boundary and
 * the command policy again for the paths and programs the model supplied.
 */
function executorFor(workspace: string) {
  if (executorCache?.workspace === workspace)
    return executorCache.executor

  const desktop = invokers()
  const executor = createExecutor({
    workspace,
    bridge: {
      async readdir(path) {
        const result = await desktop.list({ path })
        return result.entries
      },
      async readFile(path) {
        const result = await desktop.read({ path })
        return result.text
      },
      async writeFile(path, text) {
        await desktop.write({ path, text })
      },
      async spawn({ command, args, cwd, timeoutMs }) {
        let cancelled = false
        const done = desktop.exec({ command, args, cwd, timeoutMs })
          .then(result => ({ ...result, exitCode: cancelled ? -1 : result.exitCode }))
          .catch(error => ({
            exitCode: -1,
            stdout: '',
            stderr: errorMessageFromValue(error),
            timedOut: false,
          }))

        return {
          done,
          cancel: () => {
            cancelled = true
          },
        }
      },
      async screenCapture({ withData }) {
        return await desktop.screenshot({ withData })
      },
      async windowList() {
        return (await desktop.windowList()).titles
      },
      async windowFocus({ title }) {
        return await desktop.windowFocus({ title })
      },
      async openApplication({ target, isUrl }) {
        return await desktop.open({ target, isUrl })
      },
      async cursor() {
        return await desktop.cursor()
      },
      async mouseMove({ x, y }) {
        await desktop.mouseMove({ x, y })
      },
      async mouseClick({ button, double }) {
        await desktop.mouseClick({ button, double })
      },
      async keyboardType({ text }) {
        await desktop.keyboardType({ text })
      },
      async keyboardPress({ keys }) {
        await desktop.keyboardPress({ keys })
      },
    },
  })

  executorCache = { workspace, executor }
  return executor
}

const workspaceParam = {
  type: 'string',
  description: 'Path relative to the agent workspace. Defaults to "." for the workspace root.',
} as const

/** Wraps one executor method as a tool that returns text for the model. */
function desktopTool(options: {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (executor: ReturnType<typeof createExecutor>, input: Record<string, unknown>) => Promise<unknown>
}): Tool {
  return rawTool({
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    execute: async (input) => {
      try {
        const workspace = await resolveWorkspace()
        const result = await options.run(executorFor(workspace), (input ?? {}) as Record<string, unknown>)
        return typeof result === 'string' ? result : JSON.stringify(result)
      }
      catch (error) {
        // A tool failure is a result, not a crash. The model reads the message
        // and adjusts, which is why this never throws.
        return `Tool failed: ${errorMessageFromValue(error)}`
      }
    },
  })
}

export function desktopAgentTools(): Tool[] {
  return [
    desktopTool({
      name: 'desktop_list_files',
      description: 'List files and folders inside the agent workspace. Directories end with a slash. Use it before reading or writing a file.',
      parameters: {
        type: 'object',
        properties: {
          path: workspaceParam,
          depth: { type: 'integer', description: 'How many levels to descend, 1 to 6. Defaults to 1.' },
        },
        required: [],
        additionalProperties: false,
      },
      run: (executor, input) => executor.list_files({ path: String(input.path ?? '.'), depth: Number(input.depth ?? 1) }),
    }),
    desktopTool({
      name: 'desktop_search_files',
      description: 'Search the workspace for a literal text string. Returns "path:line: text" for each match.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The literal text to find.' },
          path: workspaceParam,
          maxResults: { type: 'integer', description: 'Maximum matches, 1 to 200. Defaults to 50.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.search_files({
        query: String(input.query ?? ''),
        path: String(input.path ?? '.'),
        maxResults: Number(input.maxResults ?? 50),
      }),
    }),
    desktopTool({
      name: 'desktop_read_file',
      description: 'Read a text file inside the workspace. The result carries line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the agent workspace.' },
          offset: { type: 'integer', description: 'First line to read, starting at 1.' },
          limit: { type: 'integer', description: 'How many lines to read, 1 to 2000. Defaults to 400.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.read_file({
        path: String(input.path ?? ''),
        offset: Number(input.offset ?? 1),
        limit: Number(input.limit ?? 400),
      }),
    }),
    desktopTool({
      name: 'desktop_write_file',
      description: 'Write a text file inside the workspace. This replaces the whole file, and the user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the agent workspace.' },
          content: { type: 'string', description: 'The complete new file content.' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.write_file({
        path: String(input.path ?? ''),
        content: String(input.content ?? ''),
      }),
    }),
    desktopTool({
      name: 'desktop_apply_patch',
      description: 'Replace one exact piece of text in a workspace file. The old text must appear exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the agent workspace.' },
          old: { type: 'string', description: 'The exact text to replace. It must occur once.' },
          new: { type: 'string', description: 'The replacement text.' },
        },
        required: ['path', 'old', 'new'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.apply_patch({
        path: String(input.path ?? ''),
        old: String(input.old ?? ''),
        new: String(input.new ?? ''),
      }),
    }),
    desktopTool({
      name: 'desktop_run_command',
      description: 'Run one program inside the workspace. Arguments are passed as a list and never through a shell. Only allow-listed programs run, and the user confirms every call.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The program to run, such as node, npm, git, or python.' },
          args: { type: 'array', items: { type: 'string' }, description: 'The arguments, one entry each. Do not include shell operators.' },
          timeoutMs: { type: 'integer', description: 'Timeout in milliseconds, 1000 to 600000. Defaults to 60000.' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.run_command({
        command: String(input.command ?? ''),
        args: Array.isArray(input.args) ? input.args.map(String) : [],
        timeoutMs: Number(input.timeoutMs ?? 60_000),
      }),
    }),
    desktopTool({
      name: 'desktop_screen_capture',
      description: 'Capture the primary screen. Returns the image size and, when asked, the image itself so you can look at it.',
      parameters: {
        type: 'object',
        properties: {
          withData: { type: 'boolean', description: 'Set true to receive the image, which is needed to see the screen.' },
        },
        required: [],
        additionalProperties: false,
      },
      run: async (executor, input) => {
        const result = await executor.screen_capture({ withData: input.withData === true }) as {
          width?: number
          height?: number
          dataUrl?: string
        }
        if (!result?.dataUrl)
          return `Captured the screen: ${result?.width ?? '?'}x${result?.height ?? '?'}. Call again with withData true to see it.`

        // The image travels as a content part so a vision model can read it.
        return [{ type: 'image_url', image_url: { url: result.dataUrl } }]
      },
    }),
    desktopTool({
      name: 'desktop_window_list',
      description: 'List the titles of the visible windows, to find the window to focus.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: executor => executor.window_list(),
    }),
    desktopTool({
      name: 'desktop_window_focus',
      description: 'Bring a window whose title contains the given text to the front. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Text that appears in the window title.' },
        },
        required: ['title'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.window_focus({ title: String(input.title ?? '') }),
    }),
    desktopTool({
      name: 'desktop_open_application',
      description: 'Open a program or an http(s) address. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'An http(s) URL or a program name such as notepad.' },
        },
        required: ['target'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.open_application({ target: String(input.target ?? '') }),
    }),
    desktopTool({
      name: 'desktop_mouse_move',
      description: 'Move the pointer to a screen position. The coordinates are logical pixels, which match the captured image. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'Horizontal position in logical pixels.' },
          y: { type: 'integer', description: 'Vertical position in logical pixels.' },
        },
        required: ['x', 'y'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.mouse_move({ x: Number(input.x ?? 0), y: Number(input.y ?? 0) }),
    }),
    desktopTool({
      name: 'desktop_mouse_click',
      description: 'Click the mouse at the pointer position. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Which button to click. Defaults to left.' },
          double: { type: 'boolean', description: 'Set true to double click.' },
        },
        required: [],
        additionalProperties: false,
      },
      run: (executor, input) => executor.mouse_click({
        button: (input.button === 'right' || input.button === 'middle' ? input.button : 'left'),
        double: input.double === true,
      }),
    }),
    desktopTool({
      name: 'desktop_keyboard_type',
      description: 'Type text into the focused window. Up to 2000 characters. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to type.' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.keyboard_type({ text: String(input.text ?? '') }),
    }),
    desktopTool({
      name: 'desktop_keyboard_press',
      description: 'Press one key or a shortcut, such as ["ctrl","c"] or ["enter"]. The user confirms it first.',
      parameters: {
        type: 'object',
        properties: {
          keys: { type: 'array', items: { type: 'string' }, description: 'The keys to hold together, one entry each.' },
        },
        required: ['keys'],
        additionalProperties: false,
      },
      run: (executor, input) => executor.keyboard_press({
        keys: Array.isArray(input.keys) ? input.keys.map(String) : [],
      }),
    }),
  ]
}
