import { describe, expect, it } from 'vitest'

import { isAbsolutePath, isInsidePath, normalizePath, relativeToWorkspace, resolvePath } from './path'

describe('isAbsolutePath', () => {
  it('recognizes a Windows drive, a UNC root, and a POSIX root', () => {
    expect(isAbsolutePath('C:\\work')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share')).toBe(true)
    expect(isAbsolutePath('/home/agent')).toBe(true)
  })

  it('treats a relative path as relative', () => {
    expect(isAbsolutePath('src/index.ts')).toBe(false)
    expect(isAbsolutePath('../escape')).toBe(false)
  })
})

describe('normalizePath', () => {
  it('collapses . and .. segments', () => {
    expect(normalizePath('C:\\work\\agent\\src\\..\\index.ts')).toBe('C:\\work\\agent\\index.ts')
    expect(normalizePath('/home/agent/./src/../index.ts')).toBe('/home/agent/index.ts')
  })

  it('keeps a leading .. on a relative path', () => {
    expect(normalizePath('../outside/file.txt')).toBe('../outside/file.txt')
  })

  it('keeps the separator style of the input', () => {
    expect(normalizePath('a\\b')).toBe('a\\b')
    expect(normalizePath('a/b')).toBe('a/b')
  })

  it('treats an empty path as the current directory', () => {
    expect(normalizePath('')).toBe('.')
  })
})

describe('resolvePath', () => {
  it('resolves a relative target against the root', () => {
    expect(resolvePath('C:\\work\\agent', 'src/index.ts')).toBe('C:\\work\\agent\\src\\index.ts')
  })

  it('keeps an absolute target', () => {
    expect(resolvePath('C:\\work\\agent', 'D:\\other\\file.txt')).toBe('D:\\other\\file.txt')
  })

  it('collapses a climb that stays inside the root', () => {
    expect(resolvePath('C:\\work\\agent', 'src\\..\\index.ts')).toBe('C:\\work\\agent\\index.ts')
  })

  it('keeps a climb above the root, so the boundary check can refuse it', () => {
    expect(resolvePath('C:\\work\\agent', '..\\outside.txt')).toBe('C:\\work\\outside.txt')
  })
})

describe('isInsidePath', () => {
  it('accepts a path under the root', () => {
    expect(isInsidePath('C:\\work\\agent\\src\\index.ts', 'C:\\work\\agent')).toBe(true)
  })

  it('accepts the root itself', () => {
    expect(isInsidePath('C:\\work\\agent', 'C:\\work\\agent')).toBe(true)
  })

  it('ignores case, because Windows paths do', () => {
    expect(isInsidePath('c:\\WORK\\Agent\\file.txt', 'C:\\work\\agent')).toBe(true)
  })

  it('refuses a sibling folder with a shared prefix', () => {
    // `C:\work\agent-2` must not pass as a child of `C:\work\agent`.
    expect(isInsidePath('C:\\work\\agent-2\\file.txt', 'C:\\work\\agent')).toBe(false)
  })

  it('refuses the parent folder', () => {
    expect(isInsidePath('C:\\work\\file.txt', 'C:\\work\\agent')).toBe(false)
  })

  it('handles a POSIX root', () => {
    expect(isInsidePath('/home/agent/src/index.ts', '/home/agent')).toBe(true)
    expect(isInsidePath('/home/other/file', '/home/agent')).toBe(false)
  })
})

describe('relativeToWorkspace', () => {
  it('reports a path inside the root', () => {
    expect(relativeToWorkspace('C:\\work\\agent', 'C:\\work\\agent\\src\\index.ts')).toBe('src/index.ts')
  })

  it('reports the root itself as a dot', () => {
    expect(relativeToWorkspace('C:\\work\\agent', 'C:\\work\\agent')).toBe('.')
  })

  it('returns a path outside the root unchanged, with forward slashes', () => {
    expect(relativeToWorkspace('C:\\work\\agent', 'D:\\other\\file.txt')).toBe('D:/other/file.txt')
  })
})
