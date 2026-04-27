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

    it('detects ANSI-styled --More-- prompts', () => {
      const content = 'line 1\nline 2\n\u001B[7m--More--\u001B[0m'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_space')
    })

    it('detects (END) markers', () => {
      const content = 'some log content\n\u001B[7m(END)\u001B[0m\n'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_q')
    })

    it('ignores ordinary output that merely mentions (END)', () => {
      const content = 'job status: reached (END) marker in parser output'
      const result = detectPagination(content)
      expect(result).toBeUndefined()
    })

    it('detects trailing colon only with pager context', () => {
      const content = 'Manual page printf(1) line 1\n:'
      const result = detectPagination(content)
      expect(result).toBeDefined()
      expect(result?.suggestedAction).toBe('press_q')
    })

    it('ignores bare trailing colon without pager context', () => {
      const content = 'ordinary command output\n:'
      const result = detectPagination(content)
      expect(result).toBeUndefined()
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

    it('extracts path from ANSI-styled prompts', () => {
      expect(extractCwdFromPrompt('\u001B[32malice@wonderland\u001B[0m:\u001B[34m~/rabbit-hole\u001B[0m$ ')).toBe('~/rabbit-hole')
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
