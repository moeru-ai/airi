const scenarioCaptureReadyEventType = 'scenario-capture:ready'

type ScenarioReadyWindow = Window & {
  __SCENARIO_CAPTURE_READY__?: boolean
}

export function resetScenarioReady(): void {
  window.__SCENARIO_CAPTURE_READY__ = false
}

export function markScenarioReady(): void {
  const scenarioReadyWindow = window as ScenarioReadyWindow

  scenarioReadyWindow.__SCENARIO_CAPTURE_READY__ = true
  scenarioReadyWindow.dispatchEvent(
    typeof Event === 'function'
      ? new Event(scenarioCaptureReadyEventType)
      : ({ type: scenarioCaptureReadyEventType } as Event),
  )
}
