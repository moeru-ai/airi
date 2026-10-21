/// <reference types="vite/client" />

import type { CalibrationFile, CalibrationItem, ReadingLabel } from './types'

import katex from 'katex'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'

import { unified } from 'unified'

import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'

const labels: readonly ReadingLabel[] = ['natural', 'mixed', 'spelled']
const languageNames: Readonly<Record<string, string>> = { zh: 'Mandarin Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' }

const stage = document.querySelector<HTMLElement>('#stage')!
const template = document.querySelector<HTMLTemplateElement>('#card-template')!
const stats = document.querySelector<HTMLElement>('#stats')!
const progress = document.querySelector<HTMLElement>('#progress')!
const position = document.querySelector<HTMLElement>('#position')!
const toast = document.querySelector<HTMLElement>('#toast')!
const languageSelect = document.querySelector<HTMLSelectElement>('#language')!
const showSelect = document.querySelector<HTMLSelectElement>('#show')!
const previousButton = document.querySelector<HTMLButtonElement>('#previous')!
const nextButton = document.querySelector<HTMLButtonElement>('#next')!

/**
 * Renders the markdown of a judge reason or a note. remark-rehype drops raw HTML, so the text cannot inject markup.
 */
const markdown = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify)
function renderMarkdown(text: string): string {
  return String(markdown.processSync(text))
}

let items: CalibrationItem[] = []
/**
 * The items in the order of the current filters. It is computed when the page loads or a filter changes, never when a
 * label changes, so labeling an item never moves the card to another item.
 */
let order: CalibrationItem[] = []
let index = 0

function computeOrder() {
  const language = languageSelect.value
  const show = showSelect.value
  const filtered = items.filter(item => !language || item.language === language)
  if (show === 'disagree')
    order = filtered.filter(item => item.label !== null && item.label !== item.judge.reading)
  else if (show === 'unlabeled')
    order = [...filtered.filter(item => item.label === null), ...filtered.filter(item => item.label !== null)]
  else
    order = filtered
  index = 0
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(message: string, error = false) {
  toast.textContent = message
  toast.classList.toggle('error', error)
  toast.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), error ? 4000 : 1400)
}

function renderStats() {
  const labeled = items.filter(item => item.label !== null)
  const agree = labeled.filter(item => item.label === item.judge.reading).length
  const rate = labeled.length ? `${Math.round(100 * agree / labeled.length)}%` : '–'
  stats.textContent = `${labeled.length} of ${items.length} labeled · the judge agrees on ${agree} of ${labeled.length} (${rate})`
  progress.style.width = `${items.length ? 100 * labeled.length / items.length : 0}%`
}

/** Renders the formula with KaTeX. A formula that KaTeX cannot render shows a short notice above its source. */
function renderFormula(target: HTMLElement, tex: string) {
  try {
    target.innerHTML = katex.renderToString(tex, { displayMode: true, throwOnError: true })
  }
  catch {
    target.innerHTML = '<p class="formula-error">KaTeX cannot render this source.</p>'
  }
}

/** A prompt for any agent: translate the reading and say how a native speaker would hear it. */
function translationPrompt(item: CalibrationItem): string {
  return [
    `This is a ${languageNames[item.language] ?? item.language} reading of a math formula for a text-to-speech voice.`,
    `LaTeX: ${item.reference}`,
    `Reading: ${item.spoken}`,
    'Translate the reading word by word into Chinese. Then say whether a native speaker hears it as a teacher reading the meaning, or as someone spelling the markup, such as naming every bracket or saying command names.',
  ].join('\n')
}

/** The scripts that a reading in each language must use. A reading without them is in another language. */
const languageScripts: Readonly<Record<string, RegExp>> = {
  zh: /\p{Script=Han}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
}

function chip(text: string, strong = false): HTMLSpanElement {
  const element = document.createElement('span')
  element.className = strong ? 'chip strong' : 'chip'
  element.textContent = text
  return element
}

/**
 * Updates only what a label changes: the chosen choice, the verdict of the judge, and the stats. The note box stays,
 * so its focus and cursor stay too.
 */
function renderLabel(card: HTMLElement, item: CalibrationItem) {
  for (const choice of card.querySelectorAll<HTMLButtonElement>('.choice'))
    choice.setAttribute('aria-checked', String(choice.dataset.label === item.label))

  const judge = card.querySelector<HTMLElement>('.judge')!
  // The verdict shows only after the person labels, so it does not decide the label for them.
  judge.hidden = item.label === null
  if (item.label !== null) {
    const agree = item.label === item.judge.reading
    judge.className = `judge ${agree ? 'agree' : 'disagree'}`
    judge.innerHTML = `<div class="judge-head">${agree ? '✓ The judge agrees' : '✗ The judge disagrees'}: ${item.judge.reading}</div>`
      + `<div class="markdown">${renderMarkdown(item.judge.reason)}</div>`
  }
  renderStats()
}

function renderNotePreview(card: HTMLElement, item: CalibrationItem) {
  const preview = card.querySelector<HTMLElement>('.note-preview')!
  preview.hidden = !item.note.trim()
  preview.innerHTML = renderMarkdown(item.note)
}

/** Renders the card of the current item. `direction` slides it in from the side it comes from. */
function renderCard(direction: 'next' | 'previous' | 'none' = 'none') {
  index = Math.min(Math.max(index, 0), Math.max(order.length - 1, 0))
  const item = order[index]
  previousButton.disabled = index <= 0
  nextButton.disabled = index >= order.length - 1
  position.textContent = order.length ? `${index + 1} / ${order.length}` : ''
  renderStats()
  if (!item) {
    stage.innerHTML = '<div class="card empty">No readings match the filters.</div>'
    return
  }

  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  if (direction !== 'none')
    card.classList.add(`enter-${direction}`)
  card.querySelector('.meta')!.append(
    chip(languageNames[item.language] ?? item.language, true),
    chip(item.object),
    chip(item.caseId),
  )
  renderFormula(card.querySelector<HTMLElement>('.formula')!, item.reference)
  card.querySelector('.source')!.textContent = item.reference
  const spoken = card.querySelector<HTMLElement>('.spoken')!
  spoken.textContent = item.spoken
  spoken.lang = item.language
  // A test object can answer in another language, for example sre speaks only English. The text is shown as it came,
  // so the warning says that this is the reading itself and not a display error.
  const script = languageScripts[item.language]
  if (script && !script.test(item.spoken)) {
    const warning = document.createElement('p')
    warning.className = 'language-warning'
    warning.textContent = `This reading is not in ${languageNames[item.language] ?? item.language}. The test object wrote it this way. A reading in another language does not pass.`
    spoken.after(warning)
  }

  for (const choice of card.querySelectorAll<HTMLButtonElement>('.choice'))
    choice.addEventListener('click', () => choose(card, item, choice.dataset.label as ReadingLabel))

  const noteBox = card.querySelector<HTMLTextAreaElement>('textarea')!
  noteBox.value = item.note
  // The note is kept on the item as the person types, so a label chosen before the note is saved carries the new note.
  noteBox.addEventListener('input', () => {
    item.note = noteBox.value
    renderNotePreview(card, item)
  })
  noteBox.addEventListener('change', () => void save(item, 'Note saved'))

  card.querySelector<HTMLButtonElement>('[data-action="copy"]')!.addEventListener('click', () => {
    navigator.clipboard.writeText(translationPrompt(item))
      .then(() => showToast('Translation prompt copied'))
      .catch(() => showToast('The browser blocked the clipboard', true))
  })

  stage.replaceChildren(card)
  renderLabel(card, item)
  renderNotePreview(card, item)
}

/** Saves of the page, one at a time, so a later save never lands before an earlier one. */
let saves: Promise<unknown> = Promise.resolve()

/** Saves the label and the note of an item to calibration.json through the dev server. */
function save(item: CalibrationItem, message: string): Promise<void> {
  const body = JSON.stringify({ id: item.id, label: item.label, note: item.note })
  const run = saves.then(async () => {
    const response = await fetch('/api/items', { method: 'POST', body })
    if (!response.ok)
      throw new Error(`${response.status} ${await response.text()}`)
  })
  saves = run.catch(() => undefined)
  return run.then(
    () => showToast(message),
    (error: unknown) => showToast(`Not saved: ${String(error)}`, true),
  )
}

/** Chooses a label, or clears it when it is the label the item already has. The card stays on the item. */
function choose(card: HTMLElement, item: CalibrationItem, label: ReadingLabel) {
  item.label = item.label === label ? null : label
  const choice = card.querySelector<HTMLButtonElement>(`.choice[data-label="${label}"]`)!
  choice.classList.remove('pulse')
  // Reading the layout restarts the animation when the same choice is pressed twice in a row.
  void choice.offsetWidth
  choice.classList.add('pulse')
  renderLabel(card, item)
  void save(item, item.label === null ? 'Label cleared' : `Saved as ${item.label}`)
}

function move(step: number) {
  const next = index + step
  if (next < 0 || next >= order.length)
    return
  index = next
  renderCard(step > 0 ? 'next' : 'previous')
}

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.isComposing || event.metaKey || event.ctrlKey || event.altKey)
    return
  const card = stage.querySelector<HTMLElement>('.card')
  const item = order[index]
  const chosen = ['1', '2', '3'].indexOf(event.key)
  if (card && item && chosen >= 0)
    choose(card, item, labels[chosen]!)
  else if (event.key === 'ArrowRight' || event.key === 'Enter')
    move(1)
  else if (event.key === 'ArrowLeft')
    move(-1)
  else
    return
  event.preventDefault()
})
previousButton.addEventListener('click', () => move(-1))
nextButton.addEventListener('click', () => move(1))
for (const select of [languageSelect, showSelect]) {
  select.addEventListener('change', () => {
    computeOrder()
    renderCard('none')
  })
}

async function load() {
  const file = await (await fetch('/api/items')).json() as CalibrationFile
  items = file.items
  for (const language of [...new Set(items.map(item => item.language))].sort())
    languageSelect.append(new Option(languageNames[language] ?? language, language))
  computeOrder()
  renderCard()
}

void load()
