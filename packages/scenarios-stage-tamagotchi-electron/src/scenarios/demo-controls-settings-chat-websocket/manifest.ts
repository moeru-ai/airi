import { devtoolsSection } from './sections/devtools.ts'
import { overviewSection } from './sections/overview.ts'
import { settingsSection } from './sections/settings.ts'

export const manualCaptureSections = [
  overviewSection,
  settingsSection,
  devtoolsSection,
]

export const manualAssetFileNames = manualCaptureSections.flatMap(section =>
  section.steps.map(step => step.docAssetFileName),
)
