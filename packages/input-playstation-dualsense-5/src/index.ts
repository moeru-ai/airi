export { DualSenseController } from './controller'
export { parseDualSenseInputReport } from './input-report'
export {
  buildDualSenseOutputReport,
  createDefaultDualSenseOutputState,
} from './output-report'
export type {
  DualSenseBatteryState,
  DualSenseButtonState,
  DualSenseConnectionEvent,
  DualSenseConnectionListener,
  DualSenseConnectionType,
  DualSenseControllerLifecycle,
  DualSenseDpadState,
  DualSenseInputReport,
  DualSenseInputReportListener,
  DualSenseInputState,
  DualSenseMotionState,
  DualSenseOutputReport,
  DualSenseOutputState,
  DualSenseStickState,
  DualSenseTouchPoint,
  DualSenseTriggerEffect,
  DualSenseTriggerFeedback,
  DualSenseTriggerState,
  DualSenseVector3,
} from './types'
export {
  detectDualSenseConnectionType,
  dualSenseProductId,
  dualSenseVendorId,
  getGrantedDualSenseDevices,
  isDualSenseDevice,
  isWebHidSupported,
  onDualSenseConnectionChange,
  requestDualSenseDevice,
} from './web-hid'
