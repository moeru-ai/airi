import type { AmbientLightEnvironment, AmbientLightMap, AmbientLightScreenGeometry, NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

import { ambientLightMapMargin } from '@proj-airi/stage-shared/screen-ambient-light'

import { screenAreaLightShader } from './screen-area-light'

/** Horizontal samples shared by each row of the emitting screen. */
export const screenLightGridSize = 8
/** Surface and emitter bounds in stage UVs, before the screen bends. */
export interface SurfaceLightFrame {
  character: Readonly<NormalizedRectangle>
  screen: Readonly<NormalizedRectangle>
}

/** Synthetic studies use a centered stage with a half-stage screen margin. */
export const referenceLightFrame: Readonly<SurfaceLightFrame> = Object.freeze({
  character: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
  screen: Object.freeze({ x: -ambientLightMapMargin, y: -ambientLightMapMargin, width: 1 + 2 * ambientLightMapMargin, height: 1 + 2 * ambientLightMapMargin }),
})

/**
 * Keeps each real emitter at its display position relative to the character.
 * Synthetic studies have no display and use the explicit reference rectangle.
 */
export function surfaceLightFrame(environment: AmbientLightEnvironment | undefined, character: Readonly<NormalizedRectangle> = referenceLightFrame.character): SurfaceLightFrame {
  const stage = environment?.screen?.stage
  return {
    character,
    screen: stage
      ? { x: -stage.x / stage.width, y: -stage.y / stage.height, width: 1 / stage.width, height: 1 / stage.height }
      : referenceLightFrame.screen,
  }
}

/** Eight by eight finite emitting tiles over the actual display or synthetic screen. */
export const screenLightCount = screenLightGridSize * screenLightGridSize

/** Flat reference geometry for the original preview and shader comparisons. */
export const flatScreenGeometry: Readonly<AmbientLightScreenGeometry> = Object.freeze({ gap: 0.04, bend: 0, flatRadius: 0.2 })

/**
 * Bends a horizontal screen coordinate along a circular arc without stretching
 * its emitting area. Returns X, Z, normal X, normal Z for the inward-facing side.
 * Beyond an 85-degree turn, the edge continues along its tangent instead of
 * curling back through the character. Used by lighting and the preview diagram.
 */
export function sampleScreenCurve(x: number, geometry: AmbientLightScreenGeometry): [number, number, number, number] {
  const edge = Math.max(0, Math.abs(x) - geometry.flatRadius)
  if (geometry.bend === 0 || edge === 0)
    return [x, -geometry.gap, 0, 1]
  const arc = Math.min(edge, 1.483529864 / geometry.bend)
  const angle = arc * geometry.bend
  const tail = edge - arc
  const side = Math.sign(x)
  return [
    side * (geometry.flatRadius + Math.sin(angle) / geometry.bend + tail * Math.cos(angle)),
    -geometry.gap + (1 - Math.cos(angle)) / geometry.bend + tail * Math.sin(angle),
    -side * Math.sin(angle),
    Math.cos(angle),
  ]
}

/** Prepares finite tile positions and normals when geometry or aspect changes. */
export function writeScreenGeometry(geometry: AmbientLightScreenGeometry, aspect: number, target: Float32Array, frame: Readonly<SurfaceLightFrame> = referenceLightFrame) {
  for (let i = 0; i < screenLightGridSize; i++) {
    const x = (frame.screen.x + (i + 0.5) / screenLightGridSize * frame.screen.width - frame.character.x - frame.character.width / 2) * aspect / frame.character.height
    target.set(sampleScreenCurve(x, geometry), i * 4)
  }
}

/** Writes shared tile boundaries so adjacent curved patches meet without gaps. */
export function writeScreenEdges(geometry: AmbientLightScreenGeometry, aspect: number, target: Float32Array, frame: Readonly<SurfaceLightFrame> = referenceLightFrame) {
  for (let i = 0; i <= screenLightGridSize; i++) {
    const x = (frame.screen.x + i / screenLightGridSize * frame.screen.width - frame.character.x - frame.character.width / 2) * aspect / frame.character.height
    target.set(sampleScreenCurve(x, geometry), i * 4)
  }
}

/** Spatial nodes and polar normal samples in the combined-light lookup atlas. */
export const lightFieldLayout = { positions: 16, azimuth: 17, polar: 9, layers: 2, range: 4 } as const

const { positions, azimuth, polar, layers, range } = lightFieldLayout
const fieldLookup = `
uniform sampler2D u_airiField;
uniform float u_airiFieldEnabled;
uniform vec3 u_airiFieldMean;
uniform vec4 u_airiFieldBounds;
vec3 airiFieldAt(vec2 cell, vec2 angle, float layer) {
  vec2 texel = (cell+vec2(0.,layer*${positions.toFixed(1)}))*vec2(${azimuth.toFixed(1)},${polar.toFixed(1)})+angle+vec2(.5);
  vec3 encoded = texture2D(u_airiField,texel/vec2(${(positions * azimuth).toFixed(1)},${(positions * polar * layers).toFixed(1)})).rgb;
  // Square-root storage preserves dim screen colors in a portable RGBA8 atlas.
  return encoded*encoded*${range.toFixed(1)};
}
vec3 airiReadField(vec3 n, vec2 p, float layer) {
  vec2 position = clamp((p-u_airiFieldBounds.xy)/u_airiFieldBounds.zw,vec2(0.),vec2(1.))*${(positions - 1).toFixed(1)};
  vec2 cell = min(floor(position),vec2(${(positions - 2).toFixed(1)}));
  vec2 fraction = position-cell;
  // Azimuth is undefined at either pole. All azimuth samples there describe
  // the same direction; select zero instead of passing atan(0,0) to the GPU.
  float longitude = dot(n.xy,n.xy) > 1e-10 ? atan(n.y,n.x) : 0.;
  vec2 angle = vec2((longitude+3.14159265)*(${(azimuth - 1).toFixed(1)}/6.2831853),acos(clamp(n.z,-1.,1.))*(${(polar - 1).toFixed(1)}/3.14159265));
  return mix(mix(airiFieldAt(cell,angle,layer),airiFieldAt(cell+vec2(1.,0.),angle,layer),fraction.x),
             mix(airiFieldAt(cell+vec2(0.,1.),angle,layer),airiFieldAt(cell+vec2(1.),angle,layer),fraction.x),fraction.y);
}
`

const integrate = `
  for (int row = 0; row < ${screenLightGridSize}; row++) {
    float y = airiEmitterY(float(row));
    for (int column = 0; column < ${screenLightGridSize}; column++) {
      weight = airiScreenWeight(n,stageUv,y,u_airiEmitters[column],u_airiEdges[column].xy,u_airiEdges[column+1].xy);
      irradiance += u_airiLights[row*${screenLightGridSize}+column]*weight.x;
      sheen += u_airiLights[row*${screenLightGridSize}+column]*weight.y;
      meanRadiance += u_airiLights[row*${screenLightGridSize}+column]/${screenLightCount.toFixed(1)};
    }
  }
`

/**
 * Finite screen-plane quadrature for a normal-mapped surface in front of it.
 * Consumed by Cubism's color shader. Radiance stays linear and is not normalized
 * by the brightest source, so small or distant emitters retain their energy.
 * The final ambient filter supplies base exposure and silhouette scattering.
 */
export const surfaceIrradianceShader = `
uniform vec3 u_airiLights[${screenLightCount}];
${fieldLookup}
#ifdef AIRI_BUILD_LIGHT_FIELD
float u_airiArea;
float u_airiFace;
float u_airiHair;
#else
uniform float u_airiArea;
uniform float u_airiFace;
uniform float u_airiHair;
#endif
uniform vec4 u_airiEdges[${screenLightGridSize + 1}];
${screenAreaLightShader}
uniform float u_airiStageAspect;
uniform vec4 u_airiBounds;
uniform vec4 u_airiScreen;
// Surface points and screen patches share character-height units. Translating
// either rectangle changes their relative positions; window padding cancels.
vec2 airiSurfacePosition(vec2 p) {
  return (p-u_airiBounds.xy-u_airiBounds.zw*.5)*vec2(u_airiStageAspect,1.)/u_airiBounds.w;
}
float airiEmitterY(float row) {
  return (u_airiScreen.y+(row+.5)/${screenLightGridSize.toFixed(1)}*u_airiScreen.w-u_airiBounds.y-u_airiBounds.w*.5)/u_airiBounds.w;
}
uniform vec4 u_airiEmitters[${screenLightGridSize}];
uniform float u_airiSheen;
uniform float u_airiSoftHighlights;
uniform float u_airiAmbient;
uniform float u_airiPhotometry;
uniform float u_airiResponseCurve;
uniform float u_airiLightScale;
uniform float u_airiCameraExposure;
uniform float u_airiContrast;
uniform float u_airiIllustrated;
uniform float u_airiRoughness;
uniform float u_airiSkinRelief;
uniform sampler2D u_airiFaceShadow;
uniform float u_airiFaceShadowStrength;
uniform float u_airiFaceHeight;
float airiFaceDepth = 0.;
float airiShadowVisibility(vec2 p, vec3 direction) {
  if (u_airiFaceShadowStrength <= 0. || u_airiFace < .5 || direction.z <= 0.) return 1.;
  // The fitted face approaches a common bang plane at its center. Scale the
  // gap by the current face height so zoom and window size do not move shadows.
  float gap = u_airiFaceHeight*(.14-.11*airiFaceDepth);
  // The gap uses stage-height UVs; horizontal offsets need the stage aspect.
  vec2 projected = p+vec2(direction.x/u_airiStageAspect,-direction.y)*gap/max(direction.z,.2);
  if (any(lessThan(projected,vec2(0.))) || any(greaterThan(projected,vec2(1.)))) return 1.;
  return 1.-texture2D(u_airiFaceShadow,projected).r*u_airiFaceShadowStrength;
}
// The model shader sets this per fragment from the broad face shape before
// evaluating lighting. It excludes the small nose bump used for reflection.
vec3 airiSkinNormal = vec3(0.,0.,1.);
vec3 airiFaceForward = vec3(0.,0.,1.);
float airiHairReflection(vec3 n, vec3 light, vec3 halfway) {
  float nl = max(dot(n,light),0.);
  float nv = max(n.z,0.);
  if (nl <= 0. || nv <= 0.) return 0.;
  float nh = max(dot(n,halfway),0.);
  float vh = max(halfway.z,0.);
  float alpha = clamp(u_airiRoughness,.15,.9);
  alpha *= alpha;
  float a2 = alpha*alpha;
  float denominator = nh*nh*(a2-1.)+1.;
  float distribution = a2/(3.14159265*denominator*denominator);
  float visibility = .5/max(nl*sqrt(nv*nv*(1.-a2)+a2)+nv*sqrt(nl*nl*(1.-a2)+a2),.00001);
  // Dielectric hair reflectance. GGX changes the lobe, not the normal relief.
  float fresnel = .046+.954*pow(1.-vh,5.);
  return distribution*visibility*fresnel*nl;
}
float airiUnshadowedDiffuse = 0.;
float airiSheenMask = 1.;
vec2 airiPointScreenWeight(vec3 n, vec2 p, float emitterY, vec4 emitter) {
  vec2 position = airiSurfacePosition(p);
  vec3 delta = vec3(emitter.x-position.x, position.y-emitterY, emitter.y);
  float distanceSquared = dot(delta,delta);
  // A curved tile can intersect the surface plane; zero displacement must
  // produce zero direction rather than NaN. Tile area bounds its energy.
  vec3 direction = delta*inversesqrt(max(distanceSquared,1e-8));
  float receiverCosine = max(dot(n,direction),0.);
  if (u_airiIllustrated > .5) {
    if (u_airiFace > .5) receiverCosine = mix(max(dot(airiFaceForward,direction),0.),max(dot(airiSkinNormal,direction),0.),u_airiSkinRelief);
    if (u_airiHair > .5) receiverCosine = mix(receiverCosine,smoothstep(.3,.8,receiverCosine),.65);
    else receiverCosine *= mix(.5,.7,u_airiFace);
  }
  float emitterCosine = max(dot(vec3(emitter.z,0.,emitter.w),-direction),0.);
  float area = u_airiScreen.z*u_airiScreen.w*u_airiStageAspect/(u_airiBounds.w*u_airiBounds.w*${screenLightCount.toFixed(1)});
  // Finite tile area softens the near-field quadrature, avoiding a point-light
  // singularity. At distance this converges to area*cos(emitter)/distance^2.
  float solidAngle = area*emitterCosine/(distanceSquared+area/3.14159265);
  airiUnshadowedDiffuse = receiverCosine*solidAngle/3.14159265;
  solidAngle *= airiShadowVisibility(p,direction);
  // Broad Blinn-Phong reflection, with the camera looking along -Z. Both
  // cosine factors still reject light arriving through an opaque surface.
  vec3 halfway = direction + vec3(0.,0.,1.);
  halfway *= inversesqrt(max(dot(halfway,halfway),1e-8));
  float reflectionPower = mix(24.,60.,u_airiIllustrated);
  // The face's per-fragment sheen mask already confines this accent to the
  // nose. A broader angular response keeps it visible under oblique light
  // without expanding the mask or adding shine to the rest of the skin.
  if (u_airiIllustrated > .5 && u_airiFace > .5) reflectionPower = 8.;
  float reflection = u_airiSheen > 0. ? 2.*pow(max(dot(n,halfway),0.),reflectionPower) : 0.;
  if (u_airiIllustrated > .5 && u_airiHair > .5) {
    float hairReflection = u_airiSheen > 0. ? airiHairReflection(n,direction,halfway) : 0.;
    return solidAngle*vec2(receiverCosine/3.14159265,hairReflection);
  }
  return receiverCosine*solidAngle*vec2(1./3.14159265,reflection);
}
vec2 airiScreenWeight(vec3 n, vec2 p, float y, vec4 emitter, vec2 left, vec2 right) {
  vec2 result = airiPointScreenWeight(n,p,y,emitter);
  if (u_airiArea < .5) return result;
  vec2 position = airiSurfacePosition(p);
  float x = position.x;
  float halfHeight = u_airiScreen.w/u_airiBounds.w/16.;
  vec3 a = vec3(left.x-x,position.y-y+halfHeight,left.y);
  vec3 b = vec3(left.x-x,position.y-y-halfHeight,left.y);
  vec3 c = vec3(right.x-x,position.y-y-halfHeight,right.y);
  vec3 d = vec3(right.x-x,position.y-y+halfHeight,right.y);
  float diffuse;
  if (u_airiIllustrated > .5 && u_airiFace > .5) {
    diffuse = airiAreaDiffuse(airiSkinNormal,a,b,c,d);
    if (u_airiSkinRelief < 1.) diffuse = mix(airiAreaDiffuse(airiFaceForward,a,b,c,d),diffuse,u_airiSkinRelief);
    diffuse *= .7;
  }
  else {
    diffuse = airiAreaDiffuse(n,a,b,c,d);
    if (u_airiIllustrated > .5 && u_airiHair < .5) diffuse *= .5;
  }
  // The experiment integrates Lambertian diffuse light. GGX/nose reflection
  // and optional hair-shadow visibility retain the original center sample.
  vec3 direction = vec3(emitter.x-x,position.y-y,emitter.y);
  direction *= inversesqrt(max(dot(direction,direction),1e-8));
  result.x = diffuse*airiShadowVisibility(p,direction);
  return result;
}
vec3 airiSurfaceResponseWithSheen(vec3 n, vec2 stageUv, out vec3 sheen, out vec3 colorCast) {
  sheen = vec3(0.);
  colorCast = vec3(1.);
  vec2 weight;
  vec3 irradiance = vec3(0.);
  vec3 meanRadiance = vec3(0.);
  if (u_airiArea > .5 && u_airiFieldEnabled > .5) {
    irradiance = airiReadField(n,stageUv,0.);
    if (u_airiIllustrated > .5) {
      if (u_airiFace > .5) {
        irradiance = mix(airiReadField(airiFaceForward,stageUv,0.),airiReadField(airiSkinNormal,stageUv,0.),u_airiSkinRelief)*.7;
      }
      else if (u_airiHair < .5) {
        irradiance *= .5;
      }
    }
    bool liveShadow = u_airiFace > .5 && u_airiFaceShadowStrength > 0.;
    bool hasSheen = u_airiSheen > 0. && airiSheenMask > .0001;
    // Small nose accents and sharp lobes cannot tolerate coarse angular
    // interpolation. Preserve their original reflection at full resolution.
    bool exactSheen = hasSheen && u_airiIllustrated > .5 && (u_airiHair < .5 || u_airiRoughness < .5);
    if (hasSheen && !exactSheen) sheen = airiReadField(n,stageUv,1.);
    if (liveShadow || exactSheen) {
      vec3 shadowed = vec3(0.);
      vec3 unshadowed = vec3(0.);
      for (int row=0;row<${screenLightGridSize};row++) {
        float y=airiEmitterY(float(row));
        for (int column=0;column<${screenLightGridSize};column++) {
          weight = airiPointScreenWeight(n,stageUv,y,u_airiEmitters[column]);
          if (exactSheen) sheen += u_airiLights[row*${screenLightGridSize}+column]*weight.y;
          shadowed += u_airiLights[row*${screenLightGridSize}+column]*weight.x;
          unshadowed += u_airiLights[row*${screenLightGridSize}+column]*airiUnshadowedDiffuse;
        }
      }
      // Animated visibility stays per pixel. Apply its RGB transmission ratio
      // to the cached area response; no polygon integrals run on the face.
      if (liveShadow) irradiance *= mix(vec3(1.),shadowed/max(unshadowed,vec3(.000001)),step(vec3(.000001),unshadowed));
    }
    meanRadiance = u_airiFieldMean;
  }
  else {
    ${integrate}
  }
  vec3 weights = vec3(0.2126,0.7152,0.0722);
  if (u_airiDirectional < 0.5) {
    float energy = dot(meanRadiance,weights);
    vec3 globalCast = min(meanRadiance/max(energy,0.0005),vec3(1.6));
    float presence = smoothstep(0.,0.04,energy);
    sheen = vec3(0.);
    return mix(vec3(1.),globalCast,u_airiChroma*min(u_airiStrength,1.)*presence);
  }
  // Emission only adds energy. Missing source channels cannot remove the
  // corresponding channels of the room's existing illumination.
  float lightGain = u_airiPhotometry > .5 ? u_airiLightScale : 2.;
  vec3 diffuse = mix(vec3(dot(irradiance,weights)),irradiance,u_airiChroma);
  return vec3(1.)+lightGain*u_airiStrength*diffuse;
}
vec3 airiSurfaceResponse(vec3 n, vec2 stageUv) {
  vec3 sheen;
  vec3 colorCast;
  return airiSurfaceResponseWithSheen(n,stageUv,sheen,colorCast);
}
// Public-domain linear sRGB / Oklab matrices by Bjorn Ottosson:
// https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
vec3 airiToOklab(vec3 c) {
  vec3 lms = vec3(dot(c,vec3(.4122214708,.5363325363,.0514459929)),
                  dot(c,vec3(.2119034982,.6806995451,.1073969566)),
                  dot(c,vec3(.0883024619,.2817188376,.6299787005)));
  lms = pow(max(lms,vec3(0.)),vec3(1./3.));
  return vec3(dot(lms,vec3(.2104542553,.7936177850,-.0040720468)),
              dot(lms,vec3(1.9779984951,-2.4285922050,.4505937099)),
              dot(lms,vec3(.0259040371,.7827717662,-.8086757660)));
}
vec3 airiFromOklab(vec3 c) {
  vec3 lms = vec3(c.x+.3963377774*c.y+.2158037573*c.z,
                  c.x-.1055613458*c.y-.0638541728*c.z,
                  c.x-.0894841775*c.y-1.2914855480*c.z);
  lms = lms*lms*lms;
  return vec3(dot(lms,vec3(4.0767416621,-3.3077115913,.2309699292)),
              dot(lms,vec3(-1.2684380046,2.6097574011,-.3413193965)),
              dot(lms,vec3(-.0041960863,-.7034186147,1.7076147010)));
}
vec3 airiEnhanceLightColor(vec3 baseline, vec3 lit, vec3 incident) {
  float peak = max(incident.r,max(incident.g,incident.b));
  float low = min(incident.r,min(incident.g,incident.b));
  if (u_airiResponseCurve <= 0. || peak <= .000001 || peak-low <= peak*.001) return lit;
  vec3 weights = vec3(.2126,.7152,.0722);
  float intensity = dot(lit-baseline,weights);
  if (intensity <= .000001) return lit;
  float saturation = (peak-low)/peak;
  vec3 baseLab = airiToOklab(baseline);
  vec3 litLab = airiToOklab(lit);
  // The control maps 0..100 to 0..10 extra chroma gain. The gain halves at
  // an added linear luminance of .04; neutral illumination gets no boost.
  float extra = .1*u_airiResponseCurve*saturation*saturation/(1.+intensity/.04);
  vec3 target = airiFromOklab(vec3(litLab.x,litLab.yz+extra*(litLab.yz-baseLab.yz)));
  vec3 shift = target-lit;
  // Oklab lightness is perceptual, not exact luminance. Project the proposed
  // shift onto constant linear Y, then shorten that shift to fit [baseline,1].
  // This preserves the physical brightness and forbids subtractive light.
  shift -= vec3(dot(shift,weights));
  vec3 allowance = mix(lit-baseline,vec3(1.)-lit,step(vec3(0.),shift));
  vec3 limits = allowance/max(abs(shift),vec3(.000001));
  float amount = clamp(min(limits.r,min(limits.g,limits.b)),0.,1.);
  return clamp(lit+amount*shift,baseline,vec3(1.));
}
// The light-only draw reads this before tone mapping. Ambient artwork never
// contributes; normals, materials, visibility, and emitter geometry do.
vec3 airiBloomEnergy = vec3(0.);
vec3 airiSurfaceColor(vec3 n, vec2 stageUv, vec3 color, float materialSheen) {
  if (u_airiStrength <= 0.) return color;
  vec3 albedo = pow(color,vec3(mix(1.,u_airiContrast,min(u_airiStrength,1.))));
  color = albedo*mix(1.,u_airiAmbient,min(u_airiStrength,1.));
  vec3 sheen;
  vec3 colorCast;
  airiSheenMask = materialSheen;
  vec3 response = airiSurfaceResponseWithSheen(n,stageUv,sheen,colorCast);
  if (u_airiDirectional < 0.5) return clamp(color*response,0.,1.);
  vec3 reflected = mix(vec3(dot(sheen,vec3(0.2126,0.7152,0.0722))),sheen,u_airiChroma);
  float reflectionScale = u_airiPhotometry > .5 ? u_airiLightScale : 1.;
  vec3 added = albedo*(response-1.) + reflected*u_airiSheen*materialSheen*u_airiStrength*reflectionScale;
  // Gate by incident light, not albedo: white light on blue hair stays neutral.
  vec3 incident = (response-1.)+reflected*u_airiSheen*materialSheen*u_airiStrength*reflectionScale;
  airiBloomEnergy = max(added,vec3(0.)) * (u_airiPhotometry > .5 ? mix(1.,u_airiCameraExposure,min(u_airiStrength,1.)) : 1.);
  if (u_airiPhotometry > .5) {
    float exposure = mix(1.,u_airiCameraExposure,min(u_airiStrength,1.));
    color *= exposure;
    added *= exposure;
    if (u_airiSoftHighlights < .5) return airiEnhanceLightColor(clamp(color,0.,1.),clamp(color+added,0.,1.),incident);
    // Map the unlit baseline once. Compress only newly received light into
    // its remaining headroom; a red highlight must not lower green or blue.
    float peak = max(color.r,max(color.g,color.b));
    float shoulder = .6+.4*(1.-exp(-max(peak-.6,0.)/.4));
    color *= peak > .6 ? shoulder/max(peak,.0001) : 1.;
    vec3 room = max(vec3(0.),1.-color);
    vec3 linearRoom = max(vec3(0.),vec3(.6)-color);
    vec3 shoulderRoom = max(room-linearRoom,vec3(.0001));
    vec3 compressed = min(added,linearRoom)+shoulderRoom*(1.-exp(-max(added-linearRoom,vec3(0.))/shoulderRoom));
    // One factor retains the added light's RGB proportions. Zero-energy
    // channels contribute a factor of one and keep their baseline unchanged.
    vec3 ratio = (compressed+vec3(.000001))/(added+vec3(.000001));
    float compression = min(1.,min(ratio.r,min(ratio.g,ratio.b)));
    return airiEnhanceLightColor(color,clamp(color+added*compression,0.,1.),incident);
  }
  if (u_airiSoftHighlights < 0.5) return airiEnhanceLightColor(clamp(color,0.,1.),clamp(color+added,0.,1.),incident);
  // One exposure factor preserves the added light's RGB ratios. Compressing
  // each channel independently makes a bright colored reflection turn white.
  // The limiting channel supplies headroom; unlit artwork stays exact.
  vec3 room = max(vec3(0.),1.-color);
  vec3 load = added/max(room,vec3(.0001));
  float peakLoad = max(load.r,max(load.g,load.b));
  float compression = (1.-exp(-peakLoad))/max(peakLoad,.0001);
  return airiEnhanceLightColor(color,color+added*compression,incident);
}
`

/** Writes mean linear radiance for each emitting region of the screen. */
export function writeScreenLights(map: AmbientLightMap, target: Float32Array) {
  const { width, height, data } = map
  target.fill(0)
  // Area overlap keeps energy and source positions stable for non-divisible
  // map dimensions. It also permits small synthetic maps in renderer checks.
  for (let row = 0; row < screenLightGridSize; row++) {
    const top = row * height / screenLightGridSize
    const bottom = (row + 1) * height / screenLightGridSize
    for (let column = 0; column < screenLightGridSize; column++) {
      const left = column * width / screenLightGridSize
      const right = (column + 1) * width / screenLightGridSize
      const area = (right - left) * (bottom - top)
      const targetOffset = (row * screenLightGridSize + column) * 3
      for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          const overlap = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top))
          for (let c = 0; c < 3; c++) target[targetOffset + c] += data[(y * width + x) * 3 + c] * overlap / area
        }
      }
    }
  }
}
