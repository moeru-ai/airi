/**
 * Small matrix and quaternion helpers for the converter.
 * Matrices are 4x4, column-major, as in glTF. Quaternions are `[x, y, z, w]`.
 */

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export type Mat4 = Float64Array

export function identity(): Mat4 {
  const m = new Float64Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

export function fromTrs(translation: Vec3 = [0, 0, 0], rotation: Quat = [0, 0, 0, 1], scale: Vec3 = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = rotation
  const [sx, sy, sz] = scale
  const m = new Float64Array(16)
  m[0] = (1 - 2 * (y * y + z * z)) * sx
  m[1] = 2 * (x * y + z * w) * sx
  m[2] = 2 * (x * z - y * w) * sx
  m[4] = 2 * (x * y - z * w) * sy
  m[5] = (1 - 2 * (x * x + z * z)) * sy
  m[6] = 2 * (y * z + x * w) * sy
  m[8] = 2 * (x * z + y * w) * sz
  m[9] = 2 * (y * z - x * w) * sz
  m[10] = (1 - 2 * (x * x + y * y)) * sz
  m[12] = translation[0]
  m[13] = translation[1]
  m[14] = translation[2]
  m[15] = 1
  return m
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++)
        sum += a[k * 4 + row] * b[column * 4 + k]
      out[column * 4 + row] = sum
    }
  }
  return out
}

/** General 4x4 inverse. Throws for a singular matrix. */
export function invert(m: Mat4): Mat4 {
  const inv = new Float64Array(16)
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10]
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10]
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9]
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9]
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10]
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10]
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9]
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9]
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6]
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6]
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5]
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5]
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6]
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6]
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5]
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5]
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12]
  if (Math.abs(det) < 1e-12)
    throw new Error('Singular matrix')
  for (let i = 0; i < 16; i++)
    inv[i] /= det
  return inv
}

export function transformPoint(m: Mat4, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

/** Applies only the 3x3 part, for directions and morph target deltas. */
export function transformVector(m: Mat4, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ]
}

export function translationOf(m: Mat4): Vec3 {
  return [m[12], m[13], m[14]]
}

export function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  return length === 0 ? [0, 0, 0] : [x / length, y / length, z / length]
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function quatInvert([x, y, z, w]: Quat): Quat {
  const length = x * x + y * y + z * z + w * w
  return [-x / length, -y / length, -z / length, w / length]
}

export function quatNormalize([x, y, z, w]: Quat): Quat {
  const length = Math.hypot(x, y, z, w)
  return [x / length, y / length, z / length, w / length]
}

/** The shortest rotation that turns unit vector `from` into unit vector `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
  if (dot < -0.999999) {
    // Opposite vectors: turn half a circle around any axis perpendicular to `from`.
    const axis = normalize(Math.abs(from[0]) < 0.9 ? [0, -from[2], from[1]] : [-from[1], from[0], 0])
    return [axis[0], axis[1], axis[2], 0]
  }
  const cross: Vec3 = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]]
  return quatNormalize([cross[0], cross[1], cross[2], 1 + dot])
}

/** Rotation of a matrix without scale, as a quaternion. */
export function quatFromMatrix(m: Mat4): Quat {
  const sx = Math.hypot(m[0], m[1], m[2])
  const sy = Math.hypot(m[4], m[5], m[6])
  const sz = Math.hypot(m[8], m[9], m[10])
  const r00 = m[0] / sx
  const r10 = m[1] / sx
  const r20 = m[2] / sx
  const r01 = m[4] / sy
  const r11 = m[5] / sy
  const r21 = m[6] / sy
  const r02 = m[8] / sz
  const r12 = m[9] / sz
  const r22 = m[10] / sz
  const trace = r00 + r11 + r22
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return quatNormalize([(r21 - r12) * s, (r02 - r20) * s, (r10 - r01) * s, 0.25 / s])
  }
  if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22)
    return quatNormalize([0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s])
  }
  if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22)
    return quatNormalize([(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s])
  }
  const s = 2 * Math.sqrt(1 + r22 - r00 - r11)
  return quatNormalize([(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s])
}
