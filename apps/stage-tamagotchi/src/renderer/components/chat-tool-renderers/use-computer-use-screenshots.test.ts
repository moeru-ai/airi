import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { computerUsePreviewImage } from '../../../shared/eventa/computer-use'
import { useComputerUseScreenshots } from './use-computer-use-screenshots'

const ipc = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn() }))
vi.mock('@proj-airi/electron-vueuse', () => ({ useElectronEventaInvoke: ipc.invoke }))

describe('computer use history previews', () => {
  const scopes: ReturnType<typeof effectScope>[] = []
  afterEach(() => {
    scopes.splice(0).forEach(scope => scope.stop())
    vi.resetAllMocks()
  })

  it('uses the explicit preview contract with only the artifact path', async () => {
    ipc.read.mockResolvedValue('data:image/png;base64,test')
    ipc.invoke.mockReturnValue(ipc.read)
    const scope = effectScope()
    scopes.push(scope)
    const images = scope.run(() => useComputerUseScreenshots(() => ['capture.png']))!
    await vi.waitFor(() => expect(images.get('capture.png')).toBe('data:image/png;base64,test'))
    expect(ipc.invoke).toHaveBeenCalledWith(computerUsePreviewImage)
    expect(ipc.read).toHaveBeenCalledWith({ path: 'capture.png' })
  })

  it('discards a preview that finishes after its tool result was replaced', async () => {
    const pending = Promise.withResolvers<string>()
    ipc.read.mockReturnValueOnce(pending.promise).mockResolvedValue('data:image/png;base64,new')
    ipc.invoke.mockReturnValue(ipc.read)
    const paths = ref(['old.png'])
    const scope = effectScope()
    scopes.push(scope)
    const images = scope.run(() => useComputerUseScreenshots(paths))!
    paths.value = ['new.png']
    await nextTick()
    pending.resolve('data:image/png;base64,old')
    await vi.waitFor(() => expect(images.get('new.png')).toBe('data:image/png;base64,new'))
    expect(images.has('old.png')).toBe(false)
  })
})
