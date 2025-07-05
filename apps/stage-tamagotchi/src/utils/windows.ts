import { WindowPassThroughOnHover } from '../commands'

export async function startClickThrough() {
  await WindowPassThroughOnHover.commands.startPassThrough()
}

export async function stopClickThrough() {
  await WindowPassThroughOnHover.commands.stopPassThrough()
}
