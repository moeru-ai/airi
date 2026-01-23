export interface MemoAdapter {
  init: () => Promise<void>
  processSession: (sessionId: string, messages: any[]) => Promise<void>
  query: (text: string) => Promise<any[]>
}

export class Memo {
  constructor(private adapter: MemoAdapter) {}

  async init() {
    await this.adapter.init()
  }

  async processSession(sessionId: string, messages: any[]) {
    await this.adapter.processSession(sessionId, messages)
  }

  async query(text: string) {
    return await this.adapter.query(text)
  }
}
