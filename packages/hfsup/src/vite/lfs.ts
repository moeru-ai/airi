import type { Plugin, ResolvedConfig } from 'vite'

const defaultGitAttributes = `# Default
*.7z filter=lfs diff=lfs merge=lfs -text
*.arrow filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
*.bz2 filter=lfs diff=lfs merge=lfs -text
*.ckpt filter=lfs diff=lfs merge=lfs -text
*.ftz filter=lfs diff=lfs merge=lfs -text
*.gz filter=lfs diff=lfs merge=lfs -text
*.h5 filter=lfs diff=lfs merge=lfs -text
*.joblib filter=lfs diff=lfs merge=lfs -text
*.lfs.* filter=lfs diff=lfs merge=lfs -text
*.mlmodel filter=lfs diff=lfs merge=lfs -text
*.model filter=lfs diff=lfs merge=lfs -text
*.msgpack filter=lfs diff=lfs merge=lfs -text
*.npy filter=lfs diff=lfs merge=lfs -text
*.npz filter=lfs diff=lfs merge=lfs -text
*.onnx filter=lfs diff=lfs merge=lfs -text
*.ot filter=lfs diff=lfs merge=lfs -text
*.parquet filter=lfs diff=lfs merge=lfs -text
*.pb filter=lfs diff=lfs merge=lfs -text
*.pickle filter=lfs diff=lfs merge=lfs -text
*.pkl filter=lfs diff=lfs merge=lfs -text
*.pt filter=lfs diff=lfs merge=lfs -text
*.pth filter=lfs diff=lfs merge=lfs -text
*.rar filter=lfs diff=lfs merge=lfs -text
*.safetensors filter=lfs diff=lfs merge=lfs -text
saved_model/**/* filter=lfs diff=lfs merge=lfs -text
*.tar.* filter=lfs diff=lfs merge=lfs -text
*.tar filter=lfs diff=lfs merge=lfs -text
*.tflite filter=lfs diff=lfs merge=lfs -text
*.tgz filter=lfs diff=lfs merge=lfs -text
*.wasm filter=lfs diff=lfs merge=lfs -text
*.xz filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.zst filter=lfs diff=lfs merge=lfs -text
*tfevents* filter=lfs diff=lfs merge=lfs -text
`

export function LFS(options?: {
  enableFn?: (config: ResolvedConfig) => boolean | Promise<boolean>
  extraGlobs?: string[]
  extraAttributes?: string[]
  withDefault?: boolean
}): Plugin {
  let _config: ResolvedConfig

  return {
    name: 'huggingspace:lfs-gitattributes',
    configResolved(config) {
      _config = config
    },
    async generateBundle() {
      if (options?.enableFn && !(await options.enableFn(_config))) {
        return
      }

      const extraGlobs = options?.extraGlobs ?? []
      const extraAttributes = options?.extraAttributes ?? []
      const withDefault = options?.withDefault ?? true
      const gitAttributes = withDefault ? defaultGitAttributes : ''
      const extraGlobsIntoGitAttributes = extraGlobs.map((glob) => {
        return `${glob} filter=lfs diff=lfs merge=lfs -text`
      })

      this.emitFile({
        type: 'asset',
        fileName: '.gitattributes',
        source: `${extraAttributes.join('\n')}${extraGlobsIntoGitAttributes.join('\n')}\n${gitAttributes}`,
      })
    },
  }
}
