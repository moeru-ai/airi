declare global {
  interface Window {
    __SCENARIO_CAPTURE_READY__?: boolean
  }
}

export interface ScenarioCaptureRootProps {
  name: string
  padding?: string
}
