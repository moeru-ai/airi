export interface MessageIngestionService {
  markMessageForProcessing: (messageId: string) => Promise<void>
}
