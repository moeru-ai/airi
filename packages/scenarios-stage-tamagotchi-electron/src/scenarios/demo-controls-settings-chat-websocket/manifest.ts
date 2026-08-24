import { devtoolsSection } from './sections/devtools'
import { overviewSection } from './sections/overview'
import { settingsSection } from './sections/settings'

export const manualCaptureSections = [
  overviewSection,
  settingsSection,
  devtoolsSection,
]

export const manualAssetFileNames = manualCaptureSections.flatMap(section =>
  section.steps.map(step => step.docAssetFileName),
)
