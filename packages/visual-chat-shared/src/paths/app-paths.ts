import process from 'node:process'

import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export type PathKind = 'config' | 'data' | 'cache' | 'logs' | 'models'

export function getVisualChatDir(kind: PathKind): string {
  const os = platform()

  if (os === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')

    switch (kind) {
      case 'config': return join(appData, 'AIRI', 'visual-chat', 'config')
      case 'data': return join(localAppData, 'AIRI', 'visual-chat', 'data')
      case 'cache': return join(localAppData, 'AIRI', 'visual-chat', 'cache')
      case 'logs': return join(localAppData, 'AIRI', 'visual-chat', 'logs')
      case 'models': return join(localAppData, 'AIRI', 'visual-chat', 'models')
    }
  }

  if (os === 'darwin') {
    const home = homedir()
    switch (kind) {
      case 'config': return join(home, 'Library', 'Application Support', 'AIRI', 'visual-chat')
      case 'data': return join(home, 'Library', 'Application Support', 'AIRI', 'visual-chat')
      case 'cache': return join(home, 'Library', 'Caches', 'AIRI', 'visual-chat')
      case 'logs': return join(home, 'Library', 'Logs', 'AIRI', 'visual-chat')
      case 'models': return join(home, 'Library', 'Application Support', 'AIRI', 'visual-chat', 'models')
    }
  }

  const home = homedir()
  switch (kind) {
    case 'config': return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'airi', 'visual-chat')
    case 'data': return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'airi', 'visual-chat')
    case 'cache': return join(process.env.XDG_CACHE_HOME || join(home, '.cache'), 'airi', 'visual-chat')
    case 'logs': return join(process.env.XDG_STATE_HOME || join(home, '.local', 'state'), 'airi', 'visual-chat')
    case 'models': return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'airi', 'visual-chat', 'models')
  }
}
