const { execSync } = require('node:child_process')
const process = require('node:process')

try {
  execSync('pnpm run build', { stdio: 'inherit' })

  if (process.platform === 'linux') {
    execSync('./scripts/fix_appimage_gst_plugin.sh', { stdio: 'inherit' })
  }
}
catch {
  process.exit(1)
}
