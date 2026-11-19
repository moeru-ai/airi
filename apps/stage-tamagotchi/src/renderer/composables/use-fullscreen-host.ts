import { defineInvokeHandler } from '@moeru/eventa'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { onScopeDispose, watch } from 'vue'
import { useRouter } from 'vue-router'

import { electronFullscreenClose, electronFullscreenOpen, electronFullscreenPack, electronFullscreenRequestClose } from '../../shared/eventa'
import { fullscreenSurfaceOf } from '../components/fullscreen/surfaces'
import { useFullscreenStore } from '../stores/fullscreen'

/**
 * Connects a page that hosts the fullscreen mode to the main process, the same way in every host.
 *
 * Use when:
 * - A page hosts the fullscreen mode. It calls this once.
 *
 * Expects:
 * - The page runs the transitions of the phases. The store finds the path of the page from the `fullscreen-host` query
 *   of the window.
 *
 * Returns:
 * - Nothing. The page answers requests to show, remove, and close a surface, and packs what the mode shows for the
 *   next host when the window mode changes.
 */
export function useFullscreenHost() {
  const fullscreen = useFullscreenStore()
  const router = useRouter()
  const context = getElectronEventaContext()

  // Settings entry points, the fullscreen chat mode, and a move from another host ask the main process, which forwards
  // the request here.
  const stopOpen = context.on(electronFullscreenOpen, (event) => {
    const request = event?.body
    if (!request)
      return
    void (request.pack ? fullscreen.unpack(request.pack) : fullscreen.open(request.surface, request.route))
  })
  // A chat mode switch away from the fullscreen chat ends the mode once the new chat window holds the draft.
  const stopClose = context.on(electronFullscreenClose, () => {
    void fullscreen.close()
  })
  onScopeDispose(() => {
    stopOpen()
    stopClose()
  })

  onScopeDispose(defineInvokeHandler(context, electronFullscreenPack, () => fullscreen.pack()))
  // A page with unsaved changes can stop the close, and then the mode stays where it is.
  onScopeDispose(defineInvokeHandler(context, electronFullscreenRequestClose, async () => {
    await fullscreen.close()
    return fullscreen.phase !== 'open'
  }))

  // A settings page that returns to the page of the host on its own, such as its back button on the first page, ends
  // the mode.
  watch(() => fullscreenSurfaceOf(router.currentRoute.value.path), (current, previous) => {
    if (previous && !current)
      void fullscreen.close()
  })
}
