import type {
  DualSenseConnectionType,
  DualSenseControllerLifecycle,
  DualSenseInputReport,
  DualSenseInputReportListener,
  DualSenseOutputState,
} from './types'

import { parseDualSenseInputReport } from './input-report'
import { buildDualSenseOutputReport } from './output-report'
import {
  detectDualSenseConnectionType,
  isDualSenseDevice,
} from './web-hid'

/**
 * Owns one DualSense WebHID device and converts its raw reports to typed state.
 * The controller does not schedule output reports. The caller controls the send rate.
 */
export class DualSenseController {
  readonly #connectionType: DualSenseConnectionType
  readonly #device: HIDDevice
  readonly #inputReportListeners = new Set<DualSenseInputReportListener>()
  #latestInputReport: DualSenseInputReport | undefined
  #lifecycle: DualSenseControllerLifecycle = 'closed'
  #outputSequenceNumber = 1

  constructor(device: HIDDevice) {
    if (!isDualSenseDevice(device))
      throw new Error('The HID device is not a standard DualSense controller.')

    this.#device = device
    this.#connectionType = detectDualSenseConnectionType(device)
  }

  /** The transport detected from the HID report descriptor. */
  get connectionType(): DualSenseConnectionType {
    return this.#connectionType
  }

  /** The WebHID device owned by this controller. */
  get device(): HIDDevice {
    return this.#device
  }

  /** The most recent parsed report. This value remains available after `close()`. */
  get latestInputReport(): DualSenseInputReport | undefined {
    return this.#latestInputReport
  }

  /** The current controller lifecycle state. */
  get lifecycle(): DualSenseControllerLifecycle {
    return this.#lifecycle
  }

  /**
   * Opens the HID device and starts input report handling.
   * Bluetooth controllers also receive feature report `0x05` to enable extended reports.
   */
  async open(): Promise<void> {
    if (this.#lifecycle === 'open')
      return
    if (this.#lifecycle !== 'closed')
      throw new Error(`Cannot open a DualSense controller while it is ${this.#lifecycle}.`)

    this.#lifecycle = 'opening'
    try {
      if (!this.#device.opened)
        await this.#device.open()
      if (this.#connectionType === 'bluetooth')
        await this.#device.receiveFeatureReport(0x05)
      this.#device.addEventListener('inputreport', this.#handleInputReport)
      this.#lifecycle = 'open'
    }
    catch (openError) {
      this.#device.removeEventListener('inputreport', this.#handleInputReport)
      this.#lifecycle = 'closed'
      if (!this.#device.opened)
        throw openError

      try {
        await this.#device.close()
      }
      catch (closeError) {
        throw new AggregateError(
          [openError, closeError],
          'The DualSense controller failed to open and close.',
        )
      }
      throw openError
    }
  }

  /** Stops input report handling and closes the HID device. */
  async close(): Promise<void> {
    if (this.#lifecycle === 'closed')
      return
    if (this.#lifecycle !== 'open')
      throw new Error(`Cannot close a DualSense controller while it is ${this.#lifecycle}.`)

    this.#lifecycle = 'closing'
    this.#device.removeEventListener('inputreport', this.#handleInputReport)
    try {
      if (this.#device.opened)
        await this.#device.close()
    }
    finally {
      this.#lifecycle = 'closed'
    }
  }

  /** Adds an input report listener and returns its cleanup function. */
  onInputReport(listener: DualSenseInputReportListener): () => void {
    this.#inputReportListeners.add(listener)
    return () => this.#inputReportListeners.delete(listener)
  }

  /** Builds and sends one output report with the specified controller state. */
  async sendOutput(output: DualSenseOutputState): Promise<void> {
    if (this.#lifecycle !== 'open')
      throw new Error('Open the DualSense controller before you send an output report.')

    const report = buildDualSenseOutputReport(
      this.#connectionType,
      output,
      this.#outputSequenceNumber,
    )
    this.#outputSequenceNumber = report.nextSequenceNumber
    await this.#device.sendReport(report.reportId, report.data)
  }

  readonly #handleInputReport = (event: HIDInputReportEvent): void => {
    if (event.device !== this.#device || this.#lifecycle !== 'open')
      return

    const report = parseDualSenseInputReport(this.#connectionType, event.reportId, event.data)
    if (!report)
      return

    this.#latestInputReport = report
    for (const listener of this.#inputReportListeners)
      listener(report)
  }
}
