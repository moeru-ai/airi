/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/helpers/surface-equations.ts}
 */

export type SurfaceFnDef = (x: number) => number

export const convexCircle: SurfaceFnDef = x => Math.sqrt(1 - (1 - x) ** 2)

export const convex: SurfaceFnDef = x => (1 - (1 - x) ** 4) ** (1 / 4)

export const concave: SurfaceFnDef = x => 1 - convexCircle(x)

export const lip: SurfaceFnDef = (x) => {
  const cvx = convex(x * 2)
  const ccv = concave(x) + 0.1
  const smootherstep = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3
  return cvx * (1 - smootherstep) + ccv * smootherstep
}
