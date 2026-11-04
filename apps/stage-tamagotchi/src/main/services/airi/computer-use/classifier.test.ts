import { describe, expect, it } from 'vitest'

import {
  classifyAuvCommand,
  MUTATING_COMMANDS,
  READ_ONLY_COMMANDS,
  UNADMITTED_COMMANDS,
} from './classifier'

describe('classifyAuvCommand', () => {
  describe('admitted read-only commands (12 commands)', () => {
    it.each(Array.from(READ_ONLY_COMMANDS))('classifies %s as read_only', (cmd) => {
      const result = classifyAuvCommand(['invoke', cmd])
      expect(result.category).toBe('read_only')
      expect(result.command).toBe(cmd)
      expect(result.isHelp).toBe(false)
    })

    it('classifies read-only commands with options as read_only', () => {
      const result = classifyAuvCommand(['invoke', 'window.list', '--detail', '--wide'])
      expect(result.category).toBe('read_only')
      expect(result.command).toBe('window.list')
      expect(result.isHelp).toBe(false)
    })
  })

  describe('admitted mutating commands (23 commands)', () => {
    it.each(Array.from(MUTATING_COMMANDS))('classifies %s as mutating', (cmd) => {
      const result = classifyAuvCommand(['invoke', cmd])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe(cmd)
      expect(result.isHelp).toBe(false)
    })

    it('classifies input.clickPoint with coordinates as mutating', () => {
      const result = classifyAuvCommand(['invoke', 'input.clickPoint', '100', '200'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.clickPoint')
      expect(result.isHelp).toBe(false)
    })

    it('classifies input.typeText with message as mutating', () => {
      const result = classifyAuvCommand(['invoke', 'input.typeText', 'hello world'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.typeText')
      expect(result.isHelp).toBe(false)
    })
  })

  describe('unadmitted AUV commands (scan.* and overlay.*)', () => {
    it.each(Array.from(UNADMITTED_COMMANDS))('rejects %s as unknown (not admitted by AIRI host)', (cmd) => {
      const result = classifyAuvCommand(['invoke', cmd])
      expect(result.category).toBe('unknown')
      expect(result.command).toBe(cmd)
      expect(result.reason).toContain('not admitted or supported by AIRI host')
    })

    it.each(Array.from(UNADMITTED_COMMANDS))('rejects %s even with --help as unknown', (cmd) => {
      const result = classifyAuvCommand(['invoke', cmd, '--help'])
      expect(result.category).toBe('unknown')
      expect(result.command).toBe(cmd)
      expect(result.reason).toContain('not admitted or supported by AIRI host')
    })

    it.each(Array.from(UNADMITTED_COMMANDS))('rejects invoke help %s as unknown', (cmd) => {
      const result = classifyAuvCommand(['invoke', 'help', cmd])
      expect(result.category).toBe('unknown')
      expect(result.command).toBe(cmd)
      expect(result.reason).toContain('not admitted or supported by AIRI host')
    })
  })

  describe('prefix discrimination (no naive prefix matching)', () => {
    it('discriminates screen.* commands', () => {
      expect(classifyAuvCommand(['invoke', 'screen.findText']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'screen.waitForText']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'screen.captureRegion']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'screen.clickText']).category).toBe('mutating')
    })

    it('discriminates window.* commands', () => {
      expect(classifyAuvCommand(['invoke', 'window.list']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'window.capture']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'window.findText']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'window.waitForText']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'window.clickText']).category).toBe('mutating')
    })

    it('discriminates input.* commands', () => {
      expect(classifyAuvCommand(['invoke', 'input.pointerPosition']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'input.clickPoint']).category).toBe('mutating')
      expect(classifyAuvCommand(['invoke', 'input.typeText']).category).toBe('mutating')
      expect(classifyAuvCommand(['invoke', 'input.moveMouse']).category).toBe('mutating')
    })

    it('discriminates app.* commands', () => {
      expect(classifyAuvCommand(['invoke', 'app.probePermissions']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'app.activate']).category).toBe('mutating')
    })

    it('discriminates mediaControl.* commands', () => {
      expect(classifyAuvCommand(['invoke', 'mediaControl.nowPlaying']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', 'mediaControl.play']).category).toBe('mutating')
      expect(classifyAuvCommand(['invoke', 'mediaControl.pause']).category).toBe('mutating')
    })
  })

  describe('aliases handling', () => {
    it('classifies input.axFocusText as mutating (alias of input.focusText)', () => {
      const result = classifyAuvCommand(['invoke', 'input.axFocusText', 'Submit'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.axFocusText')
    })

    it('classifies input.pressKeys as mutating (alias of input.keys)', () => {
      const result = classifyAuvCommand(['invoke', 'input.pressKeys', 'enter'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.pressKeys')
    })
  })

  describe('help invocations', () => {
    it('handles root help flags and command', () => {
      expect(classifyAuvCommand(['--help'])).toEqual({
        category: 'read_only',
        isHelp: true,
        reason: 'Root help invocation',
      })
      expect(classifyAuvCommand(['-h'])).toEqual({
        category: 'read_only',
        isHelp: true,
        reason: 'Root help invocation',
      })
      expect(classifyAuvCommand(['help'])).toEqual({
        category: 'read_only',
        isHelp: true,
        reason: 'Root help invocation',
      })
    })

    it('handles invoke-level help', () => {
      expect(classifyAuvCommand(['invoke']).isHelp).toBe(true)
      expect(classifyAuvCommand(['invoke']).category).toBe('read_only')
      expect(classifyAuvCommand(['invoke', '--help']).isHelp).toBe(true)
      expect(classifyAuvCommand(['invoke', '-h']).isHelp).toBe(true)
      expect(classifyAuvCommand(['invoke', 'help']).isHelp).toBe(true)
    })

    it('handles subcommand help flags for admitted commands', () => {
      const clickHelp = classifyAuvCommand(['invoke', 'input.clickPoint', '--help'])
      expect(clickHelp.category).toBe('read_only')
      expect(clickHelp.command).toBe('input.clickPoint')
      expect(clickHelp.isHelp).toBe(true)

      const typeHelpShort = classifyAuvCommand(['invoke', 'input.typeText', '-h'])
      expect(typeHelpShort.category).toBe('read_only')
      expect(typeHelpShort.command).toBe('input.typeText')
      expect(typeHelpShort.isHelp).toBe(true)

      const windowHelp = classifyAuvCommand(['invoke', 'window.list', '--help'])
      expect(windowHelp.category).toBe('read_only')
      expect(windowHelp.command).toBe('window.list')
      expect(windowHelp.isHelp).toBe(true)
    })

    it('handles invoke help <command> syntax for admitted commands', () => {
      const helpSub = classifyAuvCommand(['invoke', 'help', 'input.clickPoint'])
      expect(helpSub.category).toBe('read_only')
      expect(helpSub.command).toBe('input.clickPoint')
      expect(helpSub.isHelp).toBe(true)

      const helpUnknown = classifyAuvCommand(['invoke', 'help', 'nonexistent.command'])
      expect(helpUnknown.category).toBe('unknown')
      expect(helpUnknown.isHelp).toBe(true)
    })
  })

  describe('full argv semantic inspection', () => {
    it('does NOT treat --help after positional delimiter -- as a help flag', () => {
      // In clap, tokens after '--' are positional parameters (literal text), not flags
      const result = classifyAuvCommand(['invoke', 'input.typeText', '--', '--help'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.typeText')
      expect(result.isHelp).toBe(false)
    })

    it('does NOT treat text containing --help as a help flag', () => {
      const result = classifyAuvCommand(['invoke', 'input.typeText', 'please run --help'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.typeText')
      expect(result.isHelp).toBe(false)
    })

    it('does NOT treat option assignment containing --help as a help flag', () => {
      const result = classifyAuvCommand(['invoke', 'input.typeText', '--target=--help', 'hello'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.typeText')
      expect(result.isHelp).toBe(false)
    })

    it('does NOT treat mutating command with --dry-run as read_only', () => {
      const result = classifyAuvCommand(['invoke', 'input.clickPoint', '--dry-run', '100', '200'])
      expect(result.category).toBe('mutating')
      expect(result.command).toBe('input.clickPoint')
      expect(result.isHelp).toBe(false)
    })
  })

  describe('unknown commands (fail-closed)', () => {
    it('classifies unrecognized command as unknown', () => {
      const result = classifyAuvCommand(['invoke', 'input.hackTheBox'])
      expect(result.category).toBe('unknown')
      expect(result.command).toBe('input.hackTheBox')
      expect(result.isHelp).toBe(false)
    })

    it('classifies unrecognized command with --help as unknown (not read_only)', () => {
      const result = classifyAuvCommand(['invoke', 'random.cmd', '--help'])
      expect(result.category).toBe('unknown')
      expect(result.command).toBe('random.cmd')
    })
  })

  describe('malformed and illegal inputs', () => {
    it('handles non-array inputs', () => {
      expect(classifyAuvCommand(null).category).toBe('unknown')
      expect(classifyAuvCommand(undefined).category).toBe('unknown')
      expect(classifyAuvCommand('invoke window.list').category).toBe('unknown')
      expect(classifyAuvCommand(42).category).toBe('unknown')
      expect(classifyAuvCommand({}).category).toBe('unknown')
    })

    it('handles empty array', () => {
      expect(classifyAuvCommand([]).category).toBe('unknown')
    })

    it('handles array with non-string items or null bytes', () => {
      expect(classifyAuvCommand(['invoke', 123]).category).toBe('unknown')
      expect(classifyAuvCommand(['invoke', '']).category).toBe('unknown')
      expect(classifyAuvCommand(['invoke', 'window.list\0hack']).category).toBe('unknown')
    })

    it('handles non-invoke root commands', () => {
      expect(classifyAuvCommand(['daemon', 'start']).category).toBe('unknown')
      expect(classifyAuvCommand(['git', 'status']).category).toBe('unknown')
    })
  })

  describe('forbidden host-managed flags', () => {
    it.each([
      ['--store-root', '/tmp/foo'],
      ['--store-root=/tmp/foo'],
      ['--device', 'remote-1'],
      ['--device=remote-1'],
      ['--credential-stdin'],
      ['--endpoint', 'http://127.0.0.1'],
      ['--run', 'run-id-123'],
      ['--config', 'config.json'],
      ['--profile', 'admin'],
      ['--pairing-store', '/keys'],
    ])('rejects command with managed flag %s', (...flagArgs) => {
      const result = classifyAuvCommand(['invoke', 'window.list', ...flagArgs])
      expect(result.category).toBe('unknown')
      expect(result.reason).toContain('forbidden host-managed flag')
    })
  })
})
