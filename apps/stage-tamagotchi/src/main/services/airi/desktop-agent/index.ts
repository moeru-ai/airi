import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow, dialog, shell } from 'electron'

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
  desktopAgentPickWorkspace,
  desktopAgentRevealWorkspace,
  desktopAgentScreenshot,
  desktopAgentSetWorkspace,
  desktopAgentWindowFocus,
  desktopAgentWindowList,
} from '../../../../shared/eventa/desktop-agent'
import { createDesktopAgentBridge } from './capabilities'
import { readWorkspace, writeWorkspace } from './config'
import { checkCommand } from './executor'
import { isSensitivePath, resolveInsideRoot } from './sensitive'

export { defaultWorkspace } from './config'

/**
 * Registers the desktop agent.
 *
 * This service owns the machine access: files, child processes, the screen, and
 * the input devices. The agent's policy and its tool loop stay in the renderer,
 * so every call arrives here as one primitive.
 *
 * Two rules run again in this process on every call, because this process is
 * the one that touches the disk and the model supplies the arguments:
 * a target must resolve inside the workspace, and a child process must pass the
 * command policy.
 */
export function setupDesktopAgent(context: ReturnType<typeof createContext>['context']) {
  const bridge = async () => createDesktopAgentBridge({ workspace: await readWorkspace() })

  /** Applies the workspace boundary and the credential gate to one path. */
  async function guard(target: string): Promise<string> {
    const workspace = await readWorkspace()
    const absolute = resolveInsideRoot(workspace, target)
    if (isSensitivePath(absolute))
      throw new Error(`The path holds credentials or settings, so the agent cannot use it: ${target}`)
    return absolute
  }

  defineInvokeHandler(context, desktopAgentFsList, async ({ path }) => ({
    entries: await (await bridge()).readdir(await guard(path)),
  }))

  defineInvokeHandler(context, desktopAgentFsRead, async ({ path }) => ({
    text: await (await bridge()).readFile(await guard(path)),
  }))

  defineInvokeHandler(context, desktopAgentFsWrite, async ({ path, text }) => {
    await (await bridge()).writeFile(await guard(path), text)
    return { ok: true as const }
  })

  defineInvokeHandler(context, desktopAgentExec, async ({ command, args, cwd, timeoutMs }) => {
    // The renderer applies this policy before it calls. It runs again here so a
    // renderer that skipped it cannot reach a child process.
    const allowed = checkCommand(command, args)
    if (!allowed.ok)
      throw new Error(`Command refused by the host policy: ${allowed.why}`)

    const handle = await (await bridge()).spawn({ command, args, cwd: await guard(cwd), timeoutMs })
    return await handle.done
  })

  defineInvokeHandler(context, desktopAgentScreenshot, async ({ withData }) =>
    await (await bridge()).screenCapture({ withData }) as { width: number, height: number, dataUrl?: string })

  defineInvokeHandler(context, desktopAgentWindowList, async () => ({
    titles: await (await bridge()).windowList(),
  }))

  defineInvokeHandler(context, desktopAgentWindowFocus, async ({ title }) => {
    const result = await (await bridge()).windowFocus({ title })
    return { text: result?.text ?? `Focused the window "${title}".` }
  })

  defineInvokeHandler(context, desktopAgentOpen, async ({ target, isUrl }) => {
    const result = await (await bridge()).openApplication({ target, isUrl })
    return { text: result?.text ?? `Opened ${target}.` }
  })

  defineInvokeHandler(context, desktopAgentCursor, async () =>
    await (await bridge()).cursor?.() ?? { x: 0, y: 0, scale: 1 })

  defineInvokeHandler(context, desktopAgentMouseMove, async ({ x, y }) => {
    await (await bridge()).mouseMove({ x, y })
    return { ok: true as const }
  })

  defineInvokeHandler(context, desktopAgentMouseClick, async ({ button, double }) => {
    await (await bridge()).mouseClick({ button, double })
    return { ok: true as const }
  })

  defineInvokeHandler(context, desktopAgentKeyboardType, async ({ text }) => {
    await (await bridge()).keyboardType({ text })
    return { ok: true as const }
  })

  defineInvokeHandler(context, desktopAgentKeyboardPress, async ({ keys }) => {
    await (await bridge()).keyboardPress({ keys })
    return { ok: true as const }
  })

  defineInvokeHandler(context, desktopAgentGetWorkspace, async () => ({
    workspace: await readWorkspace(),
  }))

  defineInvokeHandler(context, desktopAgentSetWorkspace, async ({ workspace }) => ({
    workspace: await writeWorkspace(workspace),
  }))

  defineInvokeHandler(context, desktopAgentPickWorkspace, async () => {
    // The dialog names its owner, so it opens modal to the window that asked.
    const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const selection = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })

    const chosen = selection.canceled ? '' : selection.filePaths[0] ?? ''
    if (!chosen)
      return { workspace: await readWorkspace() }

    return { workspace: await writeWorkspace(chosen) }
  })

  defineInvokeHandler(context, desktopAgentRevealWorkspace, async () => {
    await shell.openPath(await readWorkspace())
  })
}
