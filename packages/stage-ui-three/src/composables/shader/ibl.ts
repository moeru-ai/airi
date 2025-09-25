// stage-ui/composables/shader/ibl.ts
import * as THREE from 'three'

// ===== head guard shader injection =====
const VS_DECL = `
#ifndef AIRI_DIFFUSE_VS_DECL
#define AIRI_DIFFUSE_VS_DECL
varying vec3 vWorldNormal;
#endif
`

const VS_APPLY = `
#ifndef AIRI_DIFFUSE_VS_APPLY
#define AIRI_DIFFUSE_VS_APPLY
vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
#endif
`

const FS_COMMON = `
#ifndef AIRI_DIFFUSE_COMMON
#define AIRI_DIFFUSE_COMMON
uniform int   uNprEnvMode;    // 0=off, 2=skybox
uniform float uEnvIntensity;
uniform vec3  uSHCoeffs[9];
varying vec3  vWorldNormal;

// 3rd-order SH constants
const float C0=0.2820947918; 
const float C1=0.4886025119;
const float C2=1.0925484306; 
const float C3=0.3153915653;
const float C4=0.5462742153;

vec3 AIRI_evalIrradianceSH(vec3 n){
  n = normalize(n);
  vec3 r = uSHCoeffs[0]*C0;
  r += uSHCoeffs[1]*(-C1*n.y);
  r += uSHCoeffs[2]*( C1*n.z);
  r += uSHCoeffs[3]*(-C1*n.x);
  r += uSHCoeffs[4]*( C2*n.x*n.y);
  r += uSHCoeffs[5]*(-C2*n.y*n.z);
  r += uSHCoeffs[6]*( C3*(3.0*n.z*n.z-1.0));
  r += uSHCoeffs[7]*(-C2*n.x*n.z);
  r += uSHCoeffs[8]*( C4*(n.x*n.x-n.y*n.y));
  return r;
}
#endif
`

const FS_APPLY = `
#ifndef AIRI_DIFFUSE_APPLY
#define AIRI_DIFFUSE_APPLY
if (uNprEnvMode == 2) {
  vec3 I = AIRI_evalIrradianceSH(normalize(vWorldNormal));
  gl_FragColor.rgb += (gl_FragColor.rgb / PI) * I * uEnvIntensity;
}
#endif
`

// ===== Utility tools =====
export type EnvMode = 'off' | 'skyBox' | 'hemisphere'

export const isShaderMat = (m: any): m is THREE.ShaderMaterial => !!m?.isShaderMaterial
export const isRawShader = (m: any): m is THREE.RawShaderMaterial => !!m?.isRawShaderMaterial
export const isMToon = (mat: any) => !!(mat?.isShaderMaterial && mat.userData?.vrmMaterialType === 'MToon')

export function normalizeEnvMode(v?: string | null): EnvMode {
  if (v === 'skyBox')
    return 'skyBox'
  if (v === 'hemisphere')
    return 'hemisphere'
  return 'off'
}

// Turn SphericalHarmonics3 to vec3[9] uniforms
function assignSHUniform(u: any, sh: THREE.SphericalHarmonics3 | null | undefined) {
  if (!u?.uSHCoeffs || !u.uSHCoeffs.value || !Array.isArray(u.uSHCoeffs.value))
    return
  if (!sh)
    return
  for (let i = 0; i < 9; i++) {
    u.uSHCoeffs.value[i] ||= new THREE.Vector3()
    u.uSHCoeffs.value[i].copy(sh.coefficients[i])
  }
}

// ===== Shader Material: IBL shader injection =====
export function injectDiffuseIBL(mat: THREE.ShaderMaterial) {
  const baseKey = mat.customProgramCacheKey?.() ?? ''
  mat.customProgramCacheKey = () => `${baseKey}|airi-diffuse-ibl`

  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader: any, renderer: any) => {
    prev?.(shader, renderer)

    // vertex shader declare & apply
    if (!shader.vertexShader.includes('AIRI_DIFFUSE_VS_DECL')) {
      shader.vertexShader = `${VS_DECL}\n${shader.vertexShader}`
    }
    if (shader.vertexShader.includes('#include <defaultnormal_vertex>')
      && !shader.vertexShader.includes('AIRI_DIFFUSE_VS_APPLY')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>\n${VS_APPLY}`,
      )
    }

    // fragement shader common
    if (!shader.fragmentShader.includes('AIRI_DIFFUSE_COMMON')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\n${FS_COMMON}`,
      )
    }

    // fragement shader apply
    if (!shader.fragmentShader.includes('AIRI_DIFFUSE_APPLY')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `${FS_APPLY}\n#include <dithering_fragment>`,
      )
    }

    // uniforms
    const emptySH = Array.from({ length: 9 }, () => new THREE.Vector3())
    shader.uniforms.uNprEnvMode ||= { value: 0 }
    shader.uniforms.uEnvIntensity ||= { value: 0.0 }
    shader.uniforms.uSHCoeffs ||= { value: emptySH };
    (mat.userData ||= {}).__airiIbl = shader.uniforms
  }

  if ('toneMapped' in mat)
    (mat as any).toneMapped = false
  mat.needsUpdate = true
}

// update shader settings
export function updateNprShaderSetting(
  root: THREE.Object3D,
  opts: { mode: EnvMode, intensity: number, sh?: THREE.SphericalHarmonics3 | null },
) {
  const shaderMode = opts.mode === 'skyBox' ? 2 : 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    const raw = (mesh as any).material
    const mats: any[] = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    mats.forEach((m) => {
      const u = m?.userData?.__airiIbl
      if (!u)
        return
      u.uNprEnvMode.value = shaderMode
      u.uEnvIntensity.value = opts.intensity
      assignSHUniform(u, opts.sh ?? null)
    })
  })
}

// ===== MToon LightProbe IBL =====
export function createIblProbeController(scene: THREE.Scene) {
  const probe = new THREE.LightProbe()
  probe.name = 'AIRI_IBL_Probe'
  scene.add(probe)

  function update(mode: EnvMode, intensity: number, sh?: THREE.SphericalHarmonics3 | null) {
    probe.intensity = (mode === 'skyBox') ? intensity : 0
    if (sh)
      probe.sh.copy(sh)
  }
  function dispose() {
    probe.parent?.remove(probe)
  }
  return { update, dispose }
}
