import { describe, expect, it } from 'vitest'

import { withModelExtension } from './mmd-loader'

describe('withModelExtension', () => {
  // ROOT CAUSE:
  //
  // MMDLoader.load() chooses the PMX/PMD parser from the URL file extension
  // (_extractExtension -> lastIndexOf('.')). Object/blob URLs produced by
  // URL.createObjectURL have no extension, so importing an MMD .zip failed with
  // "THREE.MMDLoader: Unknown model file extension .".
  //
  // We append the known format as a URL fragment so the extension sniff
  // succeeds; the blob URL store ignores the fragment when fetching.
  it('tags an extensionless blob URL with the known format (Issue: blob import)', () => {
    expect(withModelExtension('blob:http://host/9f1c-abc', 'pmx')).toBe('blob:http://host/9f1c-abc#airi-model.pmx')
    expect(withModelExtension('blob:http://host/9f1c-abc', 'pmd')).toBe('blob:http://host/9f1c-abc#airi-model.pmd')
  })

  it('leaves URLs that already carry a real extension unchanged', () => {
    expect(withModelExtension('https://cdn/models/miku.pmx', 'pmx')).toBe('https://cdn/models/miku.pmx')
    expect(withModelExtension('https://cdn/models/model.PMD', 'pmd')).toBe('https://cdn/models/model.PMD')
  })

  it('ignores query/fragment when checking for an existing extension', () => {
    expect(withModelExtension('https://cdn/miku.pmx?v=2', 'pmx')).toBe('https://cdn/miku.pmx?v=2')
  })
})
