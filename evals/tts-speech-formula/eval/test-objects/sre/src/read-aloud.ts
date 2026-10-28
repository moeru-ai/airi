import type { Language, ReadAloud } from '@proj-airi/evals-tts-speech-formula'

import { createRequire } from 'node:module'

import katex from 'katex'

import 'katex/contrib/mhchem'

/**
 * Reads formulas with speech-rule-engine.
 *
 * The engine keeps one global locale. Calls are queued, so concurrent cases cannot switch the locale in the middle of another read.
 */
class SpeechRuleEngineReader {
  // WORKAROUND:
  // The ESM entry `speech-rule-engine/js/index.js` loads its CLI, which requires `commander`, and it cannot find the locale files.
  // The CommonJS bundle that `main` names works, but the package ships types only for the ESM sources.
  // Source: node_modules/speech-rule-engine/package.json (no `exports` or `types`) and js/common/cli.js.
  // Remove when speech-rule-engine ships typed exports that load locales.
  private readonly engine: typeof import('speech-rule-engine/js/common/system.js') = createRequire(import.meta.url)('speech-rule-engine')
  private queue: Promise<unknown> = Promise.resolve()
  private locale: string | undefined

  read(markdown: string, language: Language): Promise<string> {
    const next = this.queue.then(() => this.readNow(markdown, language))
    this.queue = next.catch(() => undefined)
    return next
  }

  private async readNow(markdown: string, language: Language): Promise<string> {
    // Only English and Korean have locales. Chinese and Japanese get the English reading, as an SRE integration in AIRI would.
    const locale = language === 'ko' ? 'ko' : 'en'
    if (this.locale !== locale) {
      await this.engine.setupEngine({ locale, domain: 'clearspeak', modality: 'speech', style: 'default' })
      await this.engine.engineReady()
      this.locale = locale
    }
    return markdown
      .replace(/\$\$([\s\S]+?)\$\$|\$([^$]+)\$/g, (_, block: string | undefined, inline: string | undefined) => ` ${this.engine.toSpeech(mathml(block ?? inline ?? ''))} `)
      .replace(/\s+/g, ' ')
      .trim()
  }
}

/** KaTeX MathML without the outer span. The span makes SRE also read the TeX annotation. */
function mathml(tex: string): string {
  return katex.renderToString(tex, { output: 'mathml', throwOnError: false, strict: 'ignore' })
    .replace(/^<span class="katex">/, '')
    .replace(/<\/span>$/, '')
}

const speechRuleEngine = new SpeechRuleEngineReader()

/** speech-rule-engine ClearSpeak on each formula. It has no Chinese or Japanese locale, so those languages get the English reading. */
export const readAloud: ReadAloud = async (markdown, language) => speechRuleEngine.read(markdown, language)
