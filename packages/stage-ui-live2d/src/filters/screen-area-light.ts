/**
 * Cosine-weighted solid angle of a one-sided convex screen tile. The receiver
 * clips the polygon at its normal's horizon before integrating spherical edges.
 * Corners use receiver-relative coordinates; output is irradiance divided by PI.
 */
export const screenAreaLightShader = `
vec3 airiAreaEdge(vec3 a, vec3 b) {
  a *= inversesqrt(max(dot(a,a),1e-12));
  b *= inversesqrt(max(dot(b,b),1e-12));
  // Tile corners wind toward the emitter's front, opposite the incoming light.
  vec3 edge = cross(b,a);
  float sine = length(edge);
  return edge*(atan(sine,clamp(dot(a,b),-1.,1.))/max(sine,1e-6));
}
vec3 airiClipAreaEdge(vec3 n, vec3 a, vec3 b, inout vec3 entry, inout vec3 exitPoint) {
  float da = dot(n,a);
  float db = dot(n,b);
  if (da < 0. && db < 0.) return vec3(0.);
  if (da < 0.) {
    a = mix(a,b,da/(da-db));
    entry = a;
  }
  else if (db < 0.) {
    b = mix(a,b,da/(da-db));
    exitPoint = b;
  }
  return airiAreaEdge(a,b);
}
float airiAreaDiffuse(vec3 n, vec3 a, vec3 b, vec3 c, vec3 d) {
  if (dot(cross(b-a,d-a),a) >= 0.) return 0.;
  vec4 horizon = vec4(dot(n,a),dot(n,b),dot(n,c),dot(n,d));
  if (all(lessThanEqual(horizon,vec4(0.)))) return 0.;
  vec3 sum;
  if (all(greaterThanEqual(horizon,vec4(0.)))) {
    sum = airiAreaEdge(a,b)+airiAreaEdge(b,c)+airiAreaEdge(c,d)+airiAreaEdge(d,a);
  }
  else {
    vec3 entry = vec3(0.);
    vec3 exitPoint = vec3(0.);
    sum = airiClipAreaEdge(n,a,b,entry,exitPoint);
    sum += airiClipAreaEdge(n,b,c,entry,exitPoint);
    sum += airiClipAreaEdge(n,c,d,entry,exitPoint);
    sum += airiClipAreaEdge(n,d,a,entry,exitPoint);
    // The horizon arc closes the clipped polygon. Omitting it makes a tile
    // disappear when only part of its area crosses the receiving horizon.
    sum += airiAreaEdge(exitPoint,entry);
  }
  return clamp(dot(n,sum)/(2.*3.14159265),0.,1.);
}
`
