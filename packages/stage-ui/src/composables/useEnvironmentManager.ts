import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

interface EnvironmentCheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  required: boolean
  action?: string
}

interface EnvironmentManagerState {
  isChecking: boolean
  checkResults: EnvironmentCheckResult[]
  isInstalling: boolean
  installationProgress: number
  installationStatus: string
  lastCheckTime: number | null
}

export function useEnvironmentManager() {
  const { t } = useI18n()
  const state = ref<EnvironmentManagerState>({
    isChecking: false,
    checkResults: [],
    isInstalling: false,
    installationProgress: 0,
    installationStatus: '',
    lastCheckTime: null,
  })

  const environmentStatus = computed(() => {
    const failed = state.value.checkResults.filter(r => r.status === 'fail' && r.required)
    const warnings = state.value.checkResults.filter(r => r.status === 'warn')

    if (failed.length > 0) return 'error'
    if (warnings.length > 0) return 'warning'
    return 'success'
  })

  async function checkEnvironment() {
    state.value.isChecking = true
    state.value.checkResults = []

    try {
      const checks = [
        checkNodeVersion(),
        checkPnpmVersion(),
        checkDependencies(),
        checkGit(),
        checkSystemRequirements(),
      ]

      const results = await Promise.all(checks)
      state.value.checkResults = results.flat()
      state.value.lastCheckTime = Date.now()
    } catch (error) {
      console.error('Environment check failed:', error)
      state.value.checkResults.push({
        name: 'System',
        status: 'fail',
        message: t('environment.check.failed', { error: String(error) }),
        required: true,
      })
    } finally {
      state.value.isChecking = false
    }
  }

  async function checkNodeVersion() {
    try {
      const { version } = process
      const nodeVersion = version.slice(1) // Remove v prefix
      const [major, minor] = nodeVersion.split('.').map(Number)

      if (major < 18) {
        return [{
          name: 'Node.js',
          status: 'fail',
          message: t('environment.check.node.version', { current: nodeVersion, required: '18.0.0+' }),
          required: true,
          action: 'update',
        }]
      } else if (major < 20) {
        return [{
          name: 'Node.js',
          status: 'warn',
          message: t('environment.check.node.recommended', { current: nodeVersion, recommended: '20.0.0+' }),
          required: false,
          action: 'update',
        }]
      } else {
        return [{
          name: 'Node.js',
          status: 'pass',
          message: t('environment.check.node.ok', { version: nodeVersion }),
          required: true,
        }]
      }
    } catch (error) {
      return [{
        name: 'Node.js',
        status: 'fail',
        message: t('environment.check.node.notFound'),
        required: true,
        action: 'install',
      }]
    }
  }

  async function checkPnpmVersion() {
    try {
      const { execSync } = await import('child_process')
      const output = execSync('pnpm --version', { encoding: 'utf8' }).trim()
      const [major] = output.split('.').map(Number)

      if (major < 8) {
        return [{
          name: 'pnpm',
          status: 'fail',
          message: t('environment.check.pnpm.version', { current: output, required: '8.0.0+' }),
          required: true,
          action: 'update',
        }]
      } else {
        return [{
          name: 'pnpm',
          status: 'pass',
          message: t('environment.check.pnpm.ok', { version: output }),
          required: true,
        }]
      }
    } catch (error) {
      return [{
        name: 'pnpm',
        status: 'fail',
        message: t('environment.check.pnpm.notFound'),
        required: true,
        action: 'install',
      }]
    }
  }

  async function checkDependencies() {
    try {
      const { execSync } = await import('child_process')
      execSync('pnpm install --dry-run', { encoding: 'utf8' })
      return [{
        name: 'Dependencies',
        status: 'pass',
        message: t('environment.check.dependencies.ok'),
        required: true,
      }]
    } catch (error) {
      return [{
        name: 'Dependencies',
        status: 'fail',
        message: t('environment.check.dependencies.failed', { error: String(error) }),
        required: true,
        action: 'install',
      }]
    }
  }

  async function checkGit() {
    try {
      const { execSync } = await import('child_process')
      execSync('git --version', { encoding: 'utf8' })
      return [{
        name: 'Git',
        status: 'pass',
        message: t('environment.check.git.ok'),
        required: false,
      }]
    } catch (error) {
      return [{
        name: 'Git',
        status: 'warn',
        message: t('environment.check.git.notFound'),
        required: false,
        action: 'install',
      }]
    }
  }

  async function checkSystemRequirements() {
    const memory = navigator?.deviceMemory || 4
    const cpuCores = navigator?.hardwareConcurrency || 2

    const checks = []

    if (memory < 8) {
      checks.push({
        name: 'Memory',
        status: 'warn',
        message: t('environment.check.memory', { current: memory, recommended: 8 }),
        required: false,
      })
    } else {
      checks.push({
        name: 'Memory',
        status: 'pass',
        message: t('environment.check.memory.ok', { memory }),
        required: false,
      })
    }

    if (cpuCores < 4) {
      checks.push({
        name: 'CPU Cores',
        status: 'warn',
        message: t('environment.check.cpu', { current: cpuCores, recommended: 4 }),
        required: false,
      })
    } else {
      checks.push({
        name: 'CPU Cores',
        status: 'pass',
        message: t('environment.check.cpu.ok', { cores: cpuCores }),
        required: false,
      })
    }

    return checks
  }

  async function installMissingComponents() {
    state.value.isInstalling = true
    state.value.installationProgress = 0
    state.value.installationStatus = ''

    try {
      const missing = state.value.checkResults.filter(r => r.status === 'fail' && r.action)

      for (let i = 0; i < missing.length; i++) {
        const item = missing[i]
        state.value.installationStatus = t('environment.installing', { component: item.name })
        state.value.installationProgress = (i / missing.length) * 100

        switch (item.name) {
          case 'Node.js':
            await installNodeJs()
            break
          case 'pnpm':
            await installPnpm()
            break
          case 'Dependencies':
            await installDependencies()
            break
          case 'Git':
            await installGit()
            break
        }
      }

      state.value.installationStatus = t('environment.installation.completed')
      state.value.installationProgress = 100

      // Recheck environment after installation
      await checkEnvironment()
    } catch (error) {
      console.error('Installation failed:', error)
      state.value.installationStatus = t('environment.installation.failed', { error: String(error) })
    } finally {
      state.value.isInstalling = false
    }
  }

  async function installNodeJs() {
    // This is a placeholder - actual installation would depend on the OS
    // In a real implementation, we would download and install Node.js
    console.log('Installing Node.js...')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  async function installPnpm() {
    try {
      const { execSync } = await import('child_process')
      execSync('npm install -g pnpm', { encoding: 'utf8' })
    } catch (error) {
      console.error('Failed to install pnpm:', error)
      throw error
    }
  }

  async function installDependencies() {
    try {
      const { execSync } = await import('child_process')
      execSync('pnpm install', { encoding: 'utf8' })
    } catch (error) {
      console.error('Failed to install dependencies:', error)
      throw error
    }
  }

  async function installGit() {
    // This is a placeholder - actual installation would depend on the OS
    console.log('Installing Git...')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  async function oneClickDeploy() {
    state.value.isInstalling = true
    state.value.installationProgress = 0
    state.value.installationStatus = t('environment.deploy.starting')

    try {
      // Step 1: Check environment
      state.value.installationStatus = t('environment.deploy.checking')
      state.value.installationProgress = 20
      await checkEnvironment()

      // Step 2: Install missing components
      state.value.installationStatus = t('environment.deploy.installing')
      state.value.installationProgress = 40
      await installMissingComponents()

      // Step 3: Build project
      state.value.installationStatus = t('environment.deploy.building')
      state.value.installationProgress = 70
      await buildProject()

      // Step 4: Complete
      state.value.installationStatus = t('environment.deploy.completed')
      state.value.installationProgress = 100
    } catch (error) {
      console.error('One-click deploy failed:', error)
      state.value.installationStatus = t('environment.deploy.failed', { error: String(error) })
    } finally {
      state.value.isInstalling = false
    }
  }

  async function buildProject() {
    try {
      const { execSync } = await import('child_process')
      execSync('pnpm build', { encoding: 'utf8' })
    } catch (error) {
      console.error('Failed to build project:', error)
      throw error
    }
  }

  return {
    state,
    environmentStatus,
    checkEnvironment,
    installMissingComponents,
    oneClickDeploy,
  }
}
