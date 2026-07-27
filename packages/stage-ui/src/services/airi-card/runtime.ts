import type { Card, ccv3 } from '@proj-airi/ccc'
import type { Message } from '@xsai/shared-chat'

import type { AiriCard } from '../../types/airiCard'

/** Values that vary between one AIRI Card runtime and another. */
export interface CharacterCardRuntimeOptions {
  /** Display name substituted for the CCv3 `{{user}}` macro. @default 'User' at provider compilation */
  userName?: string
  /** Greeting selected for Lorebook `@@is_greeting` conditions. @default 0 */
  activeGreetingIndex?: number
  /** Random source used by `{{random:...}}` and `{{roll:N}}`. @default Math.random */
  random?: () => number
}

interface CompiledLorebookEntry {
  content: string
  depth?: number
  insertionOrder: number
  position: LorebookPosition
  role: GeneratedMessageRole
  sourceIndex: number
}

interface LorebookDecorators {
  activate: boolean
  activateOnlyAfter?: number
  activateOnlyEvery?: number
  additionalKeys: string[][]
  depth?: number
  dontActivate: boolean
  excludeKeys: string[]
  greetingIndex?: number
  position?: LorebookPosition
  role?: GeneratedMessageRole
  scanDepth?: number
}

interface ParsedLorebookContent {
  content: string
  decorators: LorebookDecorators
  recursiveScanText: string
}

type CharacterBook = ccv3.CharacterBook
type CharacterBookEntry = ccv3.CharacterBookEntry
type GeneratedMessageRole = 'assistant' | 'system' | 'user'
type LorebookPosition = 'after_char' | 'after_desc' | 'before_char' | 'before_desc' | 'personality' | 'scenario'

const supportedLorebookPositions = new Set<LorebookPosition>([
  'after_char',
  'after_desc',
  'before_char',
  'before_desc',
  'personality',
  'scenario',
])

/**
 * Compiles the stable system prompt stored in each chat session.
 *
 * Position-sensitive fields are added only to the provider projection because
 * they depend on current chat history.
 */
export function compileCharacterCardSystemPrompt(card: AiriCard | undefined): string {
  return composeSystemPrompt(card, [])
}

function composeSystemPrompt(
  card: AiriCard | undefined,
  lorebookEntries: CompiledLorebookEntry[],
): string {
  if (!card)
    return ''

  const entriesByPosition = groupLorebookEntriesByPosition(lorebookEntries)
  const sections = [
    ...entryContents(entriesByPosition.get('before_char')),
    card.systemPrompt,
    ...entryContents(entriesByPosition.get('before_desc')),
    card.description,
    ...entryContents(entriesByPosition.get('after_desc')),
    card.personality,
    ...entryContents(entriesByPosition.get('personality')),
    card.scenario,
    ...entryContents(entriesByPosition.get('scenario')),
    card.extensions.airi.modules.artistry?.widgetInstruction,
    ...entryContents(entriesByPosition.get('after_char')),
  ]

  return sections
    .filter(isNonEmptyString)
    .join('\n\n')
}

/**
 * Builds provider-only messages from a persisted conversation.
 *
 * The returned projection adds CCv3 example dialogue, matched Lorebook entries,
 * and post-history instructions without writing synthetic messages back into
 * session history. The input array and its messages are left unchanged. The
 * Lorebook token budget is not applied because this provider-neutral boundary
 * has no model tokenizer and must not discard entries using guessed token sizes.
 */
export function compileCharacterCardMessages(
  card: AiriCard | undefined,
  messages: Message[],
  options: CharacterCardRuntimeOptions = {},
): Message[] {
  if (!card)
    return messages.map(cloneMessage)

  const projected = messages.map(cloneMessage)
  const activeLorebookEntries = compileLorebookEntries(card.characterBook, projected, card, options)
  replaceStableSystemPrompt(projected, card, activeLorebookEntries, options)
  insertDepthMessages(projected, activeLorebookEntries)
  insertMessageExamples(projected, card, options)
  appendPostHistoryInstructions(projected, card, options)
  return projected
}

/**
 * Compiles the selected greeting for a newly-created individual conversation.
 *
 * Group-only greetings are intentionally excluded until AIRI has a group-chat
 * session type that can make that choice without guessing.
 */
export function compileCharacterCardGreeting(
  card: Card | undefined,
  options: CharacterCardRuntimeOptions = {},
): string | undefined {
  const greetingIndex = options.activeGreetingIndex ?? 0
  const greeting = card?.greetings?.[greetingIndex]
  if (!isNonEmptyString(greeting) || !card)
    return undefined

  return expandCharacterCardMacros(greeting, card, options)
}

function compileLorebookEntries(
  book: CharacterBook | undefined,
  messages: Message[],
  card: Card,
  options: CharacterCardRuntimeOptions,
): CompiledLorebookEntry[] {
  if (!book)
    return []

  const matchedContents: string[] = []
  const compiled: CompiledLorebookEntry[] = []
  const remaining = book.entries.map((entry, sourceIndex) => ({
    entry,
    parsed: parseLorebookContent(entry.content),
    sourceIndex,
  }))

  // Recursive scanning can activate entries from earlier matched content.
  // Every entry is removed after its first evaluation so content is injected
  // at most once and a cyclic Lorebook cannot loop forever.
  let activatedInPass = true
  while (remaining.length > 0 && activatedInPass) {
    activatedInPass = false

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index]
      if (!candidate)
        continue

      const { parsed } = candidate
      const scanText = buildLorebookScanText(
        messages,
        parsed.decorators.scanDepth ?? book.scan_depth,
        book.recursive_scanning ? matchedContents : [],
      )
      if (!matchesLorebookEntry(candidate.entry, parsed.decorators, scanText, messages, options))
        continue

      remaining.splice(index, 1)
      activatedInPass = true
      if (!parsed.content)
        continue

      const compiledContent = expandCharacterCardMacros(parsed.content, card, options)
      matchedContents.push(compiledContent, expandCharacterCardMacros(parsed.recursiveScanText, card, options))
      compiled.push({
        content: compiledContent,
        depth: parsed.decorators.position ? undefined : parsed.decorators.depth,
        insertionOrder: candidate.entry.insertion_order,
        position: parsed.decorators.position ?? candidate.entry.position ?? 'after_char',
        role: parsed.decorators.role ?? 'system',
        sourceIndex: candidate.sourceIndex,
      })
    }

    if (!book.recursive_scanning)
      break
  }

  return compiled.sort((left, right) =>
    left.insertionOrder - right.insertionOrder || left.sourceIndex - right.sourceIndex,
  )
}

function matchesLorebookEntry(
  entry: CharacterBookEntry,
  decorators: LorebookDecorators,
  scanText: string,
  messages: Message[],
  options: CharacterCardRuntimeOptions,
): boolean {
  if (!entry.enabled || (decorators.dontActivate && !decorators.activate))
    return false

  const assistantMessageCount = messages.filter(message => message.role === 'assistant').length
  if (decorators.activateOnlyAfter !== undefined && assistantMessageCount < decorators.activateOnlyAfter)
    return false
  if (decorators.activateOnlyEvery !== undefined && assistantMessageCount % decorators.activateOnlyEvery !== 0)
    return false
  if (decorators.greetingIndex !== undefined && decorators.greetingIndex !== (options.activeGreetingIndex ?? 0))
    return false

  const matches = (keys: string[]) => matchesAnyKey(keys, scanText, entry.use_regex, entry.case_sensitive)
  if (decorators.excludeKeys.length > 0 && matches(decorators.excludeKeys))
    return false
  if (decorators.additionalKeys.some(keys => !matches(keys)))
    return false

  if (decorators.activate)
    return true
  // CCv3 gives regex matching precedence over `constant`, so regex entries
  // still need a matching key even when both fields are present.
  if (entry.constant && !entry.use_regex)
    return true
  if (!matches(entry.keys))
    return false

  return !entry.selective || matches(entry.secondary_keys ?? [])
}

function matchesAnyKey(keys: string[], text: string, useRegex: boolean, caseSensitive = false): boolean {
  if (keys.length === 0)
    return false

  if (useRegex) {
    const patterns: RegExp[] = []
    for (const key of keys) {
      try {
        patterns.push(createLorebookPattern(key, caseSensitive))
      }
      catch {
        // CCv3 requires an invalid regex entry to be treated as not matched.
        return false
      }
    }
    return patterns.some(pattern => pattern.test(text))
  }

  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  return keys.some((key) => {
    const needle = caseSensitive ? key : key.toLocaleLowerCase()
    return needle.length > 0 && haystack.includes(needle)
  })
}

function createLorebookPattern(value: string, caseSensitive: boolean): RegExp {
  const delimitedPattern = value.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/)
  if (delimitedPattern)
    return new RegExp(delimitedPattern[1], delimitedPattern[2])

  return new RegExp(value, caseSensitive ? '' : 'i')
}

function buildLorebookScanText(messages: Message[], scanDepth: number | undefined, recursiveContents: string[]): string {
  const chatMessages = messages.filter(message => message.role === 'assistant' || message.role === 'user')
  const boundedMessages = scanDepth === undefined
    ? chatMessages
    : chatMessages.slice(-Math.max(0, Math.trunc(scanDepth)))

  return [
    ...boundedMessages.map(messageText),
    ...recursiveContents,
  ].filter(Boolean).join('\n')
}

/**
 * Interprets the CCv3 decorator grammar embedded in a Lorebook `content`
 * string. The Valibot codec validates the surrounding CCv3 object, while this
 * runtime step resolves syntax that the protocol intentionally stores as text.
 */
function parseLorebookContent(source: string): ParsedLorebookContent {
  const decorators: LorebookDecorators = {
    activate: false,
    additionalKeys: [],
    dontActivate: false,
    excludeKeys: [],
  }
  const lines = source.split(/\r?\n/)
  let contentStart = 0

  while (contentStart < lines.length && !lines[contentStart]?.trim())
    contentStart += 1

  for (; contentStart < lines.length; contentStart += 1) {
    const line = lines[contentStart]?.trimStart()
    if (!line?.startsWith('@@'))
      break
    if (line.startsWith('@@@')) {
      // NOTICE:
      // CCv3 fallback chains depend on whether the preceding decorator was
      // recognized, which this intentionally minimal interpreter does not track.
      // Source: `SPEC_V3.md#decorators`.
      // Remove this branch when fallback-chain semantics are implemented.
      continue
    }

    const decoratorText = line.slice(2)
    const separatorIndex = decoratorText.search(/\s/)
    const name = separatorIndex < 0 ? decoratorText : decoratorText.slice(0, separatorIndex)
    if (!/^[a-z_]+$/.test(name))
      continue

    const rawValue = separatorIndex < 0 ? '' : decoratorText.slice(separatorIndex)
    const value = rawValue.trim()
    if (name === 'activate')
      decorators.activate = true
    else if (name === 'dont_activate')
      decorators.dontActivate = true
    else if (name === 'role' && isGeneratedMessageRole(value))
      decorators.role ??= value
    else if (name === 'depth')
      decorators.depth ??= parseNonNegativeInteger(value)
    else if (name === 'scan_depth')
      decorators.scanDepth ??= parseNonNegativeInteger(value)
    else if (name === 'is_greeting')
      decorators.greetingIndex ??= parseNonNegativeInteger(value)
    else if (name === 'activate_only_after')
      decorators.activateOnlyAfter ??= parseNonNegativeInteger(value)
    else if (name === 'activate_only_every')
      decorators.activateOnlyEvery ??= parsePositiveInteger(value)
    else if (name === 'position' && isLorebookPosition(value))
      decorators.position ??= value
    else if (name === 'additional_keys')
      decorators.additionalKeys.push(splitEscapedCommaList(value))
    else if (name === 'exclude_keys')
      decorators.excludeKeys.push(...splitEscapedCommaList(value))
  }

  // Recognized and unknown decorators are runtime metadata, never prompt text.
  const content = lines.slice(contentStart).join('\n').trim()
  return {
    content,
    decorators,
    // `hidden_key` is removed from the provider prompt by macro expansion but
    // remains searchable when CCv3 recursive scanning is enabled.
    recursiveScanText: [...content.matchAll(/\{\{hidden_key:([^}]*)\}\}/gi)]
      .map(match => match[1] ?? '')
      .join('\n'),
  }
}

function replaceStableSystemPrompt(
  messages: Message[],
  card: AiriCard,
  lorebookEntries: CompiledLorebookEntry[],
  options: CharacterCardRuntimeOptions,
) {
  const stablePrompt = composeSystemPrompt(card, [])
  const runtimePrompt = expandCharacterCardMacros(
    composeSystemPrompt(card, lorebookEntries),
    card,
    options,
  )
  const systemMessage = messages.find(message => message.role === 'system')

  if (!systemMessage) {
    if (runtimePrompt)
      messages.unshift({ role: 'system', content: runtimePrompt })
    return
  }

  const content = messageText(systemMessage)
  const stablePromptIndex = stablePrompt ? content.lastIndexOf(stablePrompt) : -1
  if (stablePromptIndex >= 0) {
    systemMessage.content = [
      content.slice(0, stablePromptIndex),
      runtimePrompt,
      content.slice(stablePromptIndex + stablePrompt.length),
    ].join('')
    return
  }

  const additionalLore = lorebookEntries
    .filter(entry => entry.role === 'system' && entry.depth === undefined)
    .map(entry => entry.content)
  systemMessage.content = [
    content,
    ...additionalLore.map(entry => expandCharacterCardMacros(entry, card, options)),
  ].filter(isNonEmptyString).join('\n\n')
}

function insertMessageExamples(messages: Message[], card: Card, options: CharacterCardRuntimeOptions) {
  const examples = (card.messageExample ?? []).flatMap(example =>
    example.map((line): Message => {
      const role = line.startsWith('{{char}}:') ? 'assistant' : 'user'
      const content = line.slice(line.indexOf(':') + 1).trimStart()
      return {
        role,
        content: expandCharacterCardMacros(content, card, options),
      }
    }),
  )
  if (examples.length === 0)
    return

  const firstNonSystemIndex = messages.findIndex(message => message.role !== 'system')
  messages.splice(firstNonSystemIndex < 0 ? messages.length : firstNonSystemIndex, 0, ...examples)
}

function insertDepthMessages(
  messages: Message[],
  entries: CompiledLorebookEntry[],
) {
  for (const entry of entries) {
    if (entry.depth === undefined && entry.role === 'system')
      continue

    const generatedMessage: Message = {
      role: entry.role,
      content: entry.content,
    }
    if (entry.depth === undefined || entry.depth < 1) {
      messages.push(generatedMessage)
      continue
    }

    const chatMessageIndexes = messages
      .map((message, index) => ({ index, role: message.role }))
      .filter(message => message.role === 'assistant' || message.role === 'user')
    const anchor = chatMessageIndexes.at(-entry.depth)
    const firstNonSystemIndex = messages.findIndex(message => message.role !== 'system')
    messages.splice(anchor?.index ?? (firstNonSystemIndex < 0 ? messages.length : firstNonSystemIndex), 0, generatedMessage)
  }
}

function appendPostHistoryInstructions(messages: Message[], card: Card, options: CharacterCardRuntimeOptions) {
  if (!isNonEmptyString(card.postHistoryInstructions))
    return

  messages.push({
    role: 'system',
    content: expandCharacterCardMacros(card.postHistoryInstructions, card, options),
  })
}

function expandCharacterCardMacros(
  source: string,
  card: Pick<Card, 'name' | 'nickname' | 'version'>,
  options: CharacterCardRuntimeOptions,
): string {
  const characterName = card.nickname?.trim() || card.name
  const userName = options.userName?.trim() || 'User'
  const random = options.random ?? Math.random

  return source
    .replace(/\{\{char\}\}|<char>|<bot>/gi, characterName)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{\/\/[^}]*\}\}/g, '')
    .replace(/\{\{(?:hidden_key|comment):[^}]*\}\}/gi, '')
    .replace(/\{\{reverse:([^}]*)\}\}/gi, (_, value: string) => [...value].reverse().join(''))
    .replace(/\{\{roll:d?(\d+)\}\}/gi, (_, rawSides: string) => {
      const sides = Number.parseInt(rawSides, 10)
      if (sides < 1)
        return ''
      return String(Math.floor(random() * sides) + 1)
    })
    .replace(/\{\{random:([^}]*)\}\}/gi, (_, rawValues: string) => {
      const values = splitEscapedCommaList(rawValues)
      return values[Math.floor(random() * values.length)] ?? ''
    })
    .replace(/\{\{pick:([^}]*)\}\}/gi, (_, rawValues: string) => {
      const values = splitEscapedCommaList(rawValues)
      return values[stableStringHash(rawValues) % values.length] ?? ''
    })
}

function splitEscapedCommaList(source: string): string[] {
  const values: string[] = []
  let current = ''
  let escaped = false

  for (const character of source) {
    if (escaped) {
      current += character
      escaped = false
    }
    else if (character === '\\') {
      escaped = true
    }
    else if (character === ',') {
      values.push(current.trim())
      current = ''
    }
    else {
      current += character
    }
  }

  if (escaped)
    current += '\\'
  values.push(current.trim())
  return values
}

function stableStringHash(value: string): number {
  let hash = 0
  for (const character of value)
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return hash
}

function messageText(message: Message): string {
  if (typeof message.content === 'string')
    return message.content
  if (!Array.isArray(message.content))
    return ''

  return message.content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('')
}

function cloneMessage(message: Message): Message {
  return structuredClone(message)
}

function entryContents(entries: CompiledLorebookEntry[] | undefined): string[] {
  return entries?.map(entry => entry.content) ?? []
}

function groupLorebookEntriesByPosition(entries: CompiledLorebookEntry[]): Map<LorebookPosition, CompiledLorebookEntry[]> {
  const grouped = new Map<LorebookPosition, CompiledLorebookEntry[]>()
  for (const entry of entries) {
    if (entry.role !== 'system' || entry.depth !== undefined)
      continue

    const positionEntries = grouped.get(entry.position) ?? []
    positionEntries.push(entry)
    grouped.set(entry.position, positionEntries)
  }
  return grouped
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isGeneratedMessageRole(value: string): value is GeneratedMessageRole {
  return value === 'assistant' || value === 'system' || value === 'user'
}

function isLorebookPosition(value: string): value is LorebookPosition {
  return supportedLorebookPositions.has(value as LorebookPosition)
}

function parseNonNegativeInteger(value: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(value))
    return undefined

  return Number.parseInt(value, 10)
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = parseNonNegativeInteger(value)
  return parsed && parsed > 0 ? parsed : undefined
}
