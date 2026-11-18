export interface PaymentReceiptAdapter {
  toMajorUnits: (amount: number, currency: string) => number
  resolveReceiptUrl: (processorOrderId: string | null) => string | null | Promise<string | null>
}
