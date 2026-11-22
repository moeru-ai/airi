/**
 * Builds a PMX 2.0 file with no vertices, bones or other data.
 *
 * It is a real binary, so tests exercise fetch, parser selection and runtime assembly without a model asset.
 */
export function createEmptyPmx(): ArrayBuffer {
  const buffer = new ArrayBuffer(4 + 4 + 1 + 8 + 4 * 4 + 9 * 4)
  const view = new DataView(buffer)
  let offset = 0

  for (const byte of [0x50, 0x4D, 0x58, 0x20])
    view.setUint8(offset++, byte)
  view.setFloat32(offset, 2, true)
  offset += 4

  view.setUint8(offset++, 8)
  for (const global of [1, 0, 1, 1, 1, 1, 1, 1])
    view.setUint8(offset++, global)

  for (let index = 0; index < 4 + 9; index++) {
    view.setInt32(offset, 0, true)
    offset += 4
  }

  return buffer
}

/**
 * Builds a PMX 2.0 file with one bone, one material and one triangle.
 *
 * A rendered frame of this model issues draw calls, so tests can count the models in a scene.
 */
export function createTrianglePmx(): ArrayBuffer {
  const bytes: number[] = []
  const scratch = new DataView(new ArrayBuffer(4))
  const u8 = (...values: number[]) => {
    bytes.push(...values.map(value => value & 0xFF))
  }
  const i32 = (value: number) => {
    scratch.setInt32(0, value, true)
    u8(...new Uint8Array(scratch.buffer))
  }
  const f32 = (...values: number[]) => {
    for (const value of values) {
      scratch.setFloat32(0, value, true)
      u8(...new Uint8Array(scratch.buffer))
    }
  }
  // An empty UTF-8 text field.
  const text = () => i32(0)

  u8(0x50, 0x4D, 0x58, 0x20)
  f32(2)
  // UTF-8 text, no additional UVs, one-byte indices.
  u8(8, 1, 0, 1, 1, 1, 1, 1, 1)
  for (let field = 0; field < 4; field++)
    text()

  // Vertices: position, normal, UV, BDEF1 weight on bone 0, edge scale.
  i32(3)
  for (const [x, y] of [[-1, 0], [1, 0], [0, 2]]) {
    f32(x, y, 0, 0, 0, -1, 0, 0)
    u8(0, 0)
    f32(1)
  }
  // One triangle.
  i32(3)
  u8(0, 1, 2)
  // No textures.
  i32(0)

  // One double-sided material without textures that draws the triangle.
  i32(1)
  text()
  text()
  f32(1, 1, 1, 1, 0, 0, 0, 1, 0.5, 0.5, 0.5)
  u8(0x01)
  f32(0, 0, 0, 1, 1)
  u8(0xFF, 0xFF, 0, 1, 0)
  text()
  i32(3)

  // One root bone.
  i32(1)
  text()
  text()
  f32(0, 0, 0)
  u8(0xFF)
  i32(0)
  u8(0x1E, 0x00)
  f32(0, 1, 0)

  // No morphs, display frames, rigid bodies or joints.
  for (let section = 0; section < 4; section++)
    i32(0)

  return new Uint8Array(bytes).buffer
}
