export interface PaymentReceiptAdapter {
  toMajorUnits: (amount: number) => number
  resolveReceiptUrl: (processorOrderId: string | null) => string | null | Promise<string | null>
}
