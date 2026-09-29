import JSZip from 'jszip'

import { describe, expect, it, vi } from 'vitest'

import { inspectLive2DModelControls } from './manifest'

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

describe('live2D model controls manifest', () => {
  it('reads referenced and discovered controls without changing the archive', async () => {
    const settingsText = JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'avatar.moc3',
        Textures: ['textures/avatar.png'],
        Expressions: [{ Name: 'happy', File: 'expressions/happy.exp3.json' }],
        Motions: {
          Idle: [{ File: 'motions/idle.motion3.json' }],
        },
      },
      Groups: [],
    })
    const zip = new JSZip()
    zip.file('avatar/avatar.model3.json', settingsText)
    zip.file('avatar/avatar.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('avatar/textures/avatar.png', new Uint8Array([1, 2, 3]))
    zip.file('avatar/expressions/happy.exp3.json', JSON.stringify({
      Type: 'Live2D Expression',
      Parameters: [
        { Id: 'ParamMouthForm', Value: 0.8, Blend: 'Add' },
        { Id: 'ParamEyeLOpen', Value: 0, Blend: 'Multiply' },
      ],
    }))
    zip.file('avatar/expressions/angry.exp3.json', JSON.stringify({
      Type: 'Live2D Expression',
      Parameters: [{ Id: 'ParamBrowLY', Value: -1 }],
    }))
    zip.file('avatar/motions/idle.motion3.json', '{}')
    zip.file('avatar/motions/wave.motion3.json', '{}')

    const archive = blobFromBytes(await zip.generateAsync({ type: 'uint8array' }))

    await expect(inspectLive2DModelControls(archive)).resolves.toEqual({
      expressions: [
        {
          name: 'happy',
          fileName: 'expressions/happy.exp3.json',
          parameters: [
            { parameterId: 'ParamMouthForm', value: 0.8, blend: 'Add' },
            { parameterId: 'ParamEyeLOpen', value: 0, blend: 'Multiply' },
          ],
        },
        {
          name: 'angry',
          fileName: 'expressions/angry.exp3.json',
          parameters: [
            { parameterId: 'ParamBrowLY', value: -1, blend: 'Overwrite' },
          ],
        },
      ],
      motions: [
        { fileName: 'motions/idle.motion3.json', group: 'Idle', index: 0 },
        { fileName: 'motions/wave.motion3.json', group: 'AIRI', index: 0 },
      ],
    })
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r4132272695
  // ROOT CAUSE:
  // One invalid expression rejects the whole archive inspection.
  // Valid expressions and motions must remain available.
  it('keeps valid controls when one optional expression is malformed', async () => {
    const zip = new JSZip()
    zip.file('avatar/avatar.model3.json', JSON.stringify({
      FileReferences: {
        Expressions: [
          { Name: 'happy', File: 'expressions/happy.exp3.json' },
          { Name: 'broken', File: 'expressions/broken.exp3.json' },
        ],
        Motions: { Idle: [{ File: 'motions/idle.motion3.json' }] },
      },
    }))
    zip.file('avatar/expressions/happy.exp3.json', JSON.stringify({ Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }] }))
    zip.file('avatar/expressions/broken.exp3.json', '{invalid json')
    zip.file('avatar/motions/idle.motion3.json', '{}')

    const archive = blobFromBytes(await zip.generateAsync({ type: 'uint8array' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(inspectLive2DModelControls(archive)).resolves.toEqual({
        expressions: [{
          name: 'happy',
          fileName: 'expressions/happy.exp3.json',
          parameters: [{ parameterId: 'ParamEyeSmile', value: 1, blend: 'Add' }],
        }],
        motions: [{ fileName: 'motions/idle.motion3.json', group: 'Idle', index: 0 }],
      })
      expect(warn).toHaveBeenCalledOnce()
    }
    finally {
      warn.mockRestore()
    }
  })

  it('excludes missing optional expressions from the control manifest', async () => {
    const zip = new JSZip()
    zip.file('avatar/avatar.model3.json', JSON.stringify({
      FileReferences: {
        Expressions: [
          { Name: 'happy', File: 'expressions/happy.exp3.json' },
          { Name: 'missing', File: 'expressions/missing.exp3.json' },
        ],
        Motions: { Idle: [{ File: 'motions/idle.motion3.json' }] },
      },
    }))
    zip.file('avatar/expressions/happy.exp3.json', JSON.stringify({ Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }] }))
    zip.file('avatar/motions/idle.motion3.json', '{}')

    const archive = blobFromBytes(await zip.generateAsync({ type: 'uint8array' }))

    await expect(inspectLive2DModelControls(archive)).resolves.toEqual({
      expressions: [{
        name: 'happy',
        fileName: 'expressions/happy.exp3.json',
        parameters: [{ parameterId: 'ParamEyeSmile', value: 1, blend: 'Add' }],
      }],
      motions: [{ fileName: 'motions/idle.motion3.json', group: 'Idle', index: 0 }],
    })
  })
})
