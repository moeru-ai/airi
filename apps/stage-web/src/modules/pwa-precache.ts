export interface ViteManifestEntry {
  file: string
  isEntry?: boolean
  imports?: string[]
  css?: string[]
  assets?: string[]
}

export function filterShellPrecache<TEntry extends { url: string }>(
  entries: TEntry[],
  viteManifest: Record<string, ViteManifestEntry>,
  shellResources: string[],
  shellEntries: string[],
): TEntry[] {
  const shellFiles = new Set(shellResources.map(normalizePath))
  const requiredFiles = new Set([...shellFiles])
  const visited = new Set<string>()

  function visit(key: string) {
    if (visited.has(key)) {
      return
    }

    const entry = viteManifest[key]
    if (!entry) {
      throw new Error(`Vite manifest is missing static import ${key}`)
    }

    visited.add(key)
    const files = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])].map(normalizePath)
    files.forEach(file => {
      shellFiles.add(file)
      requiredFiles.add(file)
    })
    entry.imports?.forEach(visit)
  }

  if (!viteManifest['index.html']?.isEntry) {
    throw new Error('Vite manifest has no HTML entry')
  }

  visit('index.html')

  for (const key of shellEntries) {
    if (!viteManifest[key]) {
      throw new Error(`Vite manifest is missing shell entry ${key}`)
    }
    visit(key)
  }

  const workboxFiles = new Set(entries.map(({ url }) => normalizePath(url)))
  for (const file of requiredFiles) {
    if (!workboxFiles.has(file) && !(file === 'index.html' && workboxFiles.has(''))) {
      throw new Error(`Workbox manifest is missing required shell resource ${file}`)
    }
  }

  return entries.filter(({ url }) => {
    return shellFiles.has(normalizePath(url))
  })
}

export function extractShellResources(html: string): string[] {
  const resources: string[] = []

  for (const [, tagName, attributes] of html.matchAll(/<(script|link|img)\b([^>]*)>/gi)) {
    if (!tagName || !attributes) {
      continue
    }

    const tag = tagName.toLowerCase()
    const attributeName = tag === 'link' ? 'href' : 'src'
    const attribute = new RegExp(`(?:^|\\s)${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i').exec(attributes)
    const url = attribute?.[1] ?? attribute?.[2] ?? attribute?.[3]
    const relAttribute = /(?:^|\s)rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/i.exec(attributes)
    const rel = relAttribute?.[1] ?? relAttribute?.[2] ?? relAttribute?.[3]
    const includeLink = tag !== 'link' || (
      rel !== undefined
      && rel.toLowerCase().split(/\s+/).some(value => ['stylesheet', 'icon', 'apple-touch-icon', 'manifest', 'preload'].includes(value))
    )
    if (url && includeLink && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) {
      resources.push(url)
    }
  }

  return resources
}

function normalizePath(path: string): string {
  return path
    .replace(/[?#].*$/, '')
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/|\/)+/, '')
}
