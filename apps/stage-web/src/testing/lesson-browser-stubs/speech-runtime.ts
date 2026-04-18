const intent = {
  intentId: 'lesson-intent',
  streamId: 'lesson-stream',
  ownerId: 'peptutor-lesson',
  priority: 1,
  stream: new ReadableStream(),
  writeLiteral() {},
  writeSpecial() {},
  writeFlush() {},
  end() {},
  cancel() {},
}

const speechRuntimeStore = {
  stopByOwner() {},
  openIntent() {
    return intent
  },
}

export function useSpeechRuntimeStore() {
  return speechRuntimeStore
}
