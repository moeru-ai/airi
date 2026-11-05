/**
 * Illustrated face relief in full face-height units. Cubism reference coordinates
 * keep the cheeks attached to each face drawable. Separate nose coordinates
 * follow the painted nose mesh. The caller rotates the normal with head yaw
 * and applies the existing material mask to the nose reflection.
 */
export const faceSurfaceShader = `
vec2 airiFaceCoordinates(vec2 reference) {
  return (reference-u_airiGeneratedFace.xy)/(u_airiGeneratedFace.zw*vec2(1.,-1.));
}
float airiFaceHeightAt(vec2 q,vec2 noseQ,float noseStrength) {
  float taper=1.-.18*smoothstep(.2,1.2,-q.y);
  vec2 broad=vec2(q.x/taper,q.y);
  float face=exp(-.65*dot(broad,broad));
  vec2 cheek=vec2((abs(q.x)-.42)/.38,(q.y+.24)/.42);
  face=.9*face+.1*exp(-.5*dot(cheek,cheek));
  // Anchor relief to the attachment's nose center, not a character's image UV.
  vec2 localNose=noseQ-airiFaceCoordinates(u_airiGeneratedNose.xy);
  vec2 bridge=vec2(localNose.x/.065,(localNose.y-.2472727)/.24);
  vec2 tip=localNose/vec2(.09,.108);
  return .22*face+.006*noseStrength*(.38*exp(-.5*dot(bridge,bridge))+exp(-.5*dot(tip,tip)));
}
vec3 airiFaceNormalAt(vec2 q,vec2 noseQ,float noseStrength) {
  // Convert UV radii to physical half-width/full-height before differentiation.
  float faceAspect=u_airiGeneratedFace.z*u_airiMapSize.x/(2.*u_airiGeneratedFace.w*u_airiMapSize.y);
  float stepSize=.002;
  float dx=(airiFaceHeightAt(q+vec2(stepSize,0.),noseQ+vec2(stepSize,0.),noseStrength)-airiFaceHeightAt(q-vec2(stepSize,0.),noseQ-vec2(stepSize,0.),noseStrength))/(2.*stepSize*faceAspect);
  float dy=(airiFaceHeightAt(q+vec2(0.,stepSize),noseQ+vec2(0.,stepSize),noseStrength)-airiFaceHeightAt(q-vec2(0.,stepSize),noseQ-vec2(0.,stepSize),noseStrength))/(2.*stepSize*.5);
  return normalize(vec3(-dx,-dy,1.));
}
`
