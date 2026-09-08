/**
 * Fitted Iru face relief in full face-height units. Cubism reference coordinates
 * keep the cheeks attached to each face drawable. Separate nose coordinates
 * follow the painted nose mesh. The caller rotates the normal with head yaw
 * and applies the existing material mask to the nose reflection.
 */
export const faceSurfaceShader = `
vec2 airiFaceCoordinates(vec2 reference) {
  return (reference-vec2(.5,.190625))/vec2(.0703125,-.06875);
}
float airiFaceHeightAt(vec2 q,vec2 noseQ,float noseStrength) {
  float taper=1.-.18*smoothstep(.2,1.2,-q.y);
  vec2 broad=vec2(q.x/taper,q.y);
  float face=exp(-.65*dot(broad,broad));
  vec2 cheek=vec2((abs(q.x)-.42)/.38,(q.y+.24)/.42);
  face=.9*face+.1*exp(-.5*dot(cheek,cheek));
  vec2 bridge=vec2(noseQ.x/.065,(noseQ.y+.23)/.24);
  vec2 tip=(noseQ-vec2(0.,-.4772727))/vec2(.09,.108);
  return .22*face+.006*noseStrength*(.38*exp(-.5*dot(bridge,bridge))+exp(-.5*dot(tip,tip)));
}
vec3 airiFaceNormalAt(vec2 q,vec2 noseQ,float noseStrength) {
  // The source reference is 512x640. Physical half-width/full-height is 9/22;
  // differentiating in these units makes shading match the fitted surface.
  float stepSize=.002;
  float dx=(airiFaceHeightAt(q+vec2(stepSize,0.),noseQ+vec2(stepSize,0.),noseStrength)-airiFaceHeightAt(q-vec2(stepSize,0.),noseQ-vec2(stepSize,0.),noseStrength))/(2.*stepSize*(9./22.));
  float dy=(airiFaceHeightAt(q+vec2(0.,stepSize),noseQ+vec2(0.,stepSize),noseStrength)-airiFaceHeightAt(q-vec2(0.,stepSize),noseQ-vec2(0.,stepSize),noseStrength))/(2.*stepSize*.5);
  return normalize(vec3(-dx,-dy,1.));
}
`
