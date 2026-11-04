import { initializeHostContext } from './owner'

export async function openApplicationDataDirectory(): Promise<void> {
  await initializeHostContext().platform.openApplicationDataDirectory()
}
