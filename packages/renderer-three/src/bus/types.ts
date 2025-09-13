// stage-ui => renderer-three
export interface RendererCommands {
  'orbit-controls/target': { x: number, y: number, z: number }
  'orbit-controls/model-size': { x: number, y: number, z: number }
  'orbit-controls/position': { x: number, y: number, z: number }
  'orbit-controls/fov': number
  'orbit-controls/distance': number

}

// renderer-three => stage-ui
export interface RendererEvents {
  'orbit-controls/camera-changed': { cameraPosition: { x: number, y: number, z: number }, cameraDistance: number }

}
