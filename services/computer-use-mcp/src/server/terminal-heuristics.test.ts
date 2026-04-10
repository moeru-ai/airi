import { describe, expect, it } from 'vitest'

import { detectPagination, extractCwdFromPrompt } from './terminal-heuristics'

describe('terminal-heuristics', () => {
  describe('detectPagination', () => {
    it('detects --More-- prompts', () => {
      const content = 'line 1\nline 2\n--More--'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_space')
    })

    it('detects (END) markers', () => {
      const content = 'some log content\n(END)'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_q')
    })

    it('detects trailing colon in pagers', () => {
      const content = 'long file content line 100\n:'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_q')
    })

    it('returns undefined for normal output', () => {
      const content = 'user@host:~$ ls -l\ntotal 0'
      const result = detectPagination(content)
      expect(result).toBeUndefined()
    })
  })

  describe('extractCwdFromPrompt', () => {
    it('extracts path from bash/zsh default style', () => {
      expect(extractCwdFromPrompt('alice@wonderland:~/rabbit-hole$ ')).toBe('~/rabbit-hole')
      expect(extractCwdFromPrompt('root@localhost:/etc# ')).toBe('/etc')
    })

    it('extracts path from CentOS/brackets style', () => {
      expect(extractCwdFromPrompt('[bob@server /var/log]$ ')).toBe('/var/log')
      expect(extractCwdFromPrompt('[alice@home ~]# ')).toBe('~')
    })

    it('returns undefined for non-prompt lines', () => {
      expect(extractCwdFromPrompt('total 123')).toBeUndefined()
      expect(extractCwdFromPrompt('drwxr-xr-x  2 root  root  4096 Apr  9 18:00 .')).toBeUndefined()
    })
  })
})
