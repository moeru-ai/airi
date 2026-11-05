import type { NormalAttachment, ReviewedFaceSurface } from './attachment'

/**
 * Refines only an agent-reviewed face and retains the original AI output.
 * The same broad surface is evaluated in the shader for every facial paint
 * layer, including areas uncovered by animation. Cubism still clips the art.
 */
export async function refineFaceNormals(attachment: NormalAttachment, faceSurface: ReviewedFaceSurface): Promise<NormalAttachment> {
  const rawNormal = attachment.rawNormal ?? attachment.normal
  const images = await Promise.all([attachment.ownership, rawNormal].map(blob => createImageBitmap(blob)))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = attachment.width
    canvas.height = attachment.height
    const context = canvas.getContext('2d')!
    const pixels = images.map((image) => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, canvas.width, canvas.height)
    })
    const owners = new Set(faceSurface.drawables.map(index => index + 1))
    for (let i = 0; i < pixels[1].data.length; i += 4) {
      if (!owners.has(pixels[0].data[i] + pixels[0].data[i + 1] * 256))
        continue
      let x = (((i / 4) % canvas.width + 0.5) / canvas.width - faceSurface.center[0]) / faceSurface.radius[0] * 0.55
      let y = -((Math.floor(i / 4 / canvas.width) + 0.5) / canvas.height - faceSurface.center[1]) / faceSurface.radius[1] * 0.55
      if (faceSurface.nose) {
        const nose = faceSurface.nose
        const nx = (((i / 4) % canvas.width + 0.5) / canvas.width - nose.center[0]) / nose.radius[0]
        const ny = ((Math.floor(i / 4 / canvas.width) + 0.5) / canvas.height - nose.center[1]) / nose.radius[1]
        const bump = Math.exp(-0.5 * (nx * nx + ny * ny)) * nose.strength
        x += nx * bump
        y -= ny * bump
      }
      const length = Math.hypot(x, y, 1)
      pixels[1].data.set([Math.round((x / length * 0.5 + 0.5) * 255), Math.round((y / length * 0.5 + 0.5) * 255), Math.round((1 / length * 0.5 + 0.5) * 255)], i)
    }
    context.putImageData(pixels[1], 0, 0)
    const normal = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode corrected face normals.')), 'image/png'))
    return { ...attachment, rawNormal, normal, faceSurface }
  }
  finally { images.forEach(image => image.close()) }
}
