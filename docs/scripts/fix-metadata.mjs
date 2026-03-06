import fs from 'node:fs'
import path from 'node:path'

const zhDir = 'content/zh-Hans/docs'
const enDir = 'content/en/docs'
const jaDir = 'content/ja/docs'

function getFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir)
  files.forEach((file) => {
    const name = path.join(dir, file)
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, allFiles)
    }
    else if (name.endsWith('.md')) {
      allFiles.push(name)
    }
  })
  return allFiles
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/)
  if (match) {
    const yaml = match[1]
    const data = {}
    yaml.split('\n').forEach((line) => {
      const [key, ...value] = line.split(':')
      if (key && value.length) {
        data[key.trim()] = value.join(':').trim()
      }
    })
    return { data, raw: match[0], content: content.slice(match[0].length).trim() }
  }
  return { data: {}, raw: '', content: content.trim() }
}

const translations = {
  '桌面端': { en: 'Desktop', ja: 'デスクトップ' },
  '参与并贡献 Project AIRI': { en: 'Contribute to Project AIRI', ja: 'Project AIRI への貢献' },
  '设计指南': { en: 'Design Guidelines', ja: 'デザインガイドライン' },
  '资源': { en: 'Resources', ja: 'リソース' },
  '工具': { en: 'Tools', ja: 'ツール' },
  '贡献': { en: 'Contributing', ja: '貢献' },
  '文档': { en: 'Documentation', ja: 'ドキュメント' },
  '服务': { en: 'Services', ja: 'サービス' },
  '概览': { en: 'Overview', ja: '概要' },
  '版本': { en: 'Versions', ja: 'バージョン' },
  '关于 AI VTuber': { en: 'About AI VTuber', ja: 'AI VTuber について' },
  '关于 Neuro-sama': { en: 'About Neuro-sama', ja: 'Neuro-sama について' },
  '其他类似项目': { en: 'Other Similar Projects', ja: '他の類似プロジェクト' },
  '配置': { en: 'Configuration', ja: '設定' },
  '网页端': { en: 'Web UI', ja: 'ウェブ UI' },
}

function translate(text, lang) {
  if (translations[text] && translations[text][lang]) {
    return translations[text][lang]
  }
  // Fallback: simple mapping or keep as is for manual review
  return text
}

const zhFiles = getFiles(zhDir)

zhFiles.forEach((zhFile) => {
  const relPath = path.relative(zhDir, zhFile)
  const zhContent = fs.readFileSync(zhFile, 'utf-8')
  const { data: zhData } = parseFrontmatter(zhContent)

  if (Object.keys(zhData).length === 0)
    return

  const targets = [
    { dir: enDir, lang: 'en' },
    { dir: jaDir, lang: 'ja' },
  ]

  targets.forEach(({ dir, lang }) => {
    const targetFile = path.join(dir, relPath)
    if (fs.existsSync(targetFile)) {
      const targetContent = fs.readFileSync(targetFile, 'utf-8')
      const { data: targetData, raw: targetRaw, content: targetBody } = parseFrontmatter(targetContent)

      let updated = false
      const newData = { ...targetData }

      for (const key in zhData) {
        if (!newData[key]) {
          newData[key] = translate(zhData[key], lang)
          updated = true
        }
      }

      if (updated) {
        const newFrontmatter = `---\n${Object.entries(newData).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n`
        fs.writeFileSync(targetFile, newFrontmatter + targetBody)
        console.log(`Updated ${targetFile}`)
      }
    }
  })
})
