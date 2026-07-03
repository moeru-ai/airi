import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { marked } from 'marked'

const ARCH_DIR = resolve('docs/architecture')
const OUTPUT_DIR = resolve('docs/api/arch')

const SHELL_ESCAPE = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false,
})

function HTML_TEMPLATE(title, body, nav) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - AIRI Architecture Docs</title>
<style>
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
@media (prefers-color-scheme: dark) { body { background: #1a1a2e; color: #e0e0e0; } }
.container { display: flex; min-height: 100vh; }
.sidebar { width: 280px; flex-shrink: 0; background: #f8f9fa; border-right: 1px solid #e1e4e8; padding: 2rem 1.5rem; position: sticky; top: 0; align-self: flex-start; overflow-y: auto; max-height: 100vh; }
@media (prefers-color-scheme: dark) { .sidebar { background: #16213e; border-right-color: #0f3460; } }
.sidebar h1 { font-size: 1.1rem; margin: 0 0 0.5rem 0; }
.sidebar p { font-size: 0.8rem; color: #586069; margin: 0 0 1.5rem 0; }
.sidebar nav { display: flex; flex-direction: column; gap: 0.25rem; }
.sidebar nav a { display: block; padding: 0.4rem 0.75rem; border-radius: 6px; text-decoration: none; color: #24292e; font-size: 0.9rem; transition: background 0.15s; }
@media (prefers-color-scheme: dark) { .sidebar nav a { color: #e0e0e0; } }
.sidebar nav a:hover { background: #e1e4e8; }
@media (prefers-color-scheme: dark) { .sidebar nav a:hover { background: #0f3460; } }
.sidebar nav a.active { background: #0969da; color: white; font-weight: 500; }
.content { flex: 1; max-width: 900px; padding: 3rem 4rem; line-height: 1.7; }
.content h1 { font-size: 2rem; border-bottom: 2px solid #0969da; padding-bottom: 0.5rem; }
.content h2 { font-size: 1.5rem; margin-top: 2.5rem; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3rem; }
.content h3 { font-size: 1.2rem; margin-top: 2rem; }
.content p { margin: 1rem 0; }
.content ul, .content ol { padding-left: 2rem; margin: 1rem 0; }
.content li { margin: 0.4rem 0; }
.content code { background: #f6f8fa; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; word-break: break-word; }
@media (prefers-color-scheme: dark) { .content code { background: #0f3460; } }
.content pre { background: #f6f8fa; border-radius: 8px; padding: 1.2rem; overflow-x: auto; border: 1px solid #e1e4e8; line-height: 1.5; }
@media (prefers-color-scheme: dark) { .content pre { background: #0d1b2a; border-color: #0f3460; } }
.content pre code { background: none; padding: 0; font-size: 0.85rem; }
.content blockquote { border-left: 4px solid #0969da; background: #f0f7ff; padding: 0.8rem 1.2rem; margin: 1rem 0; border-radius: 0 8px 8px 0; }
@media (prefers-color-scheme: dark) { .content blockquote { background: #0a2540; } }
.content blockquote p { margin: 0.3rem 0; }
.content table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
.content th, .content td { border: 1px solid #d1d9e0; padding: 0.6rem 0.9rem; text-align: left; }
.content th { background: #f6f8fa; }
@media (prefers-color-scheme: dark) { .content th { background: #0f3460; } }
.content a { color: #0969da; text-decoration: none; }
.content a:hover { text-decoration: underline; }
.colored-diagram { background: #f6f8fa; border: 1px solid #d1d9e0; border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
@media (prefers-color-scheme: dark) { .colored-diagram { background: #0d1b2a; border-color: #0f3460; } }
.colored-diagram pre { margin: 0; background: none; border: none; padding: 0; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.85rem; line-height: 1.4; }
@media (max-width: 768px) { .container { flex-direction: column; } .sidebar { width: 100%; position: static; max-height: none; } .content { padding: 1.5rem; } }
</style>
</head>
<body>
<div class="container">
<aside class="sidebar">
<h1>AIRI Architecture Docs</h1>
<nav>${nav}</nav>
</aside>
<main class="content">
${body}
</main>
</div>
</body>
</html>`
}

function extractTitle(fpath) {
  const firstLine = readFileSync(fpath, 'utf8').split('\n').find(l => l.startsWith('# ')) ?? ''
  let stripped = firstLine.replace(/^#\s*/, '').trim()
  stripped = stripped.replace(/^AIRI\s+/, '')
  stripped = stripped.replace(/\s*[—–-]\s*Architecture\s*(?:Document|Documentation|sandbox infrastructure)?$/i, '')
  return stripped
}

function getMarkdownFiles(dir) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map((f) => {
      const path = join(dir, f)
      return {
        name: f,
        path,
        slug: f.replace(/\.md$/, ''),
        title: extractTitle(path),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function mdToHtml(md, currentSlug) {
  return marked.parse(md)
    .replace(/<pre><code>(\s*<span class="hljs-comment">.*?<\/span>\n)?([\s\S]*?)<\/code><\/pre>/g, (match, comment, body) => {
      const cleaned = body
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
      const lines = cleaned.split('\n')
      if (lines.some(l => /[┌┐└┘│─├┤┬┴┼╔╗╚╝╠╣╦╩╬═║]/.test(l))) {
        return `<div class="colored-diagram"><pre>${cleaned}</pre></div>`
      }
      return `<pre><code>${body}</code></pre>`
    })
    .replace(/href="([^"]+)\.md"/g, 'href="$1.html"')
}

function buildNav(files, currentSlug) {
  return files.map(f =>
    `<a href="${f.slug}.html" class="${f.slug === currentSlug ? 'active' : ''}">${f.title}</a>`,
  ).join('\n')
}

function generate() {
  const files = getMarkdownFiles(ARCH_DIR)
  mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const file of files) {
    const md = readFileSync(file.path, 'utf8')
    const html = mdToHtml(md, file.slug)
    const nav = buildNav(files, file.slug)
    const full = HTML_TEMPLATE(file.title, html, nav)
    const outPath = join(OUTPUT_DIR, `${file.slug}.html`)
    writeFileSync(outPath, full)
    console.log(`Generated ${relative(process.cwd(), outPath)}`)
  }

  console.log(`\nDone — ${files.length} docs generated in ${OUTPUT_DIR}`)
}

generate()
