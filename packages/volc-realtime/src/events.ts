// ---- Client -> Server ----

/** Client -> Server: initiate connection (Connect-level) */
export const StartConnection = 1

/** Client -> Server: finish connection (Connect-level) */
export const FinishConnection = 2

/** Client -> Server: start a dialogue session (Session-level) */
export const StartSession = 100

/** Client -> Server: finish the current session (Session-level) */
export const FinishSession = 102

/** Client -> Server: send audio data (Session-level) */
export const TaskRequest = 200

/** Client -> Server: update config during session */
export const UpdateConfig = 201

/** Client -> Server: say hello text */
export const SayHello = 300

/** Client -> Server: end ASR (push-to-talk mode) */
export const EndASR = 400

/** Client -> Server: synthesize text to speech */
export const ChatTTSText = 500

/** Client -> Server: text query input */
export const ChatTextQuery = 501

/** Client -> Server: external RAG text input */
export const ChatRAGText = 502

// ---- Server -> Client ----

/** Server -> Client: connection established (Connect-level) */
export const ConnectionStarted = 50

/** Server -> Client: connection failed */
export const ConnectionFailed = 51

/** Server -> Client: connection finished */
export const ConnectionFinished = 52

/** Server -> Client: session established (Session-level) */
export const SessionStarted = 150

/** Server -> Client: session finished */
export const SessionFinished = 152

/** Server -> Client: session failed */
export const SessionFailed = 153

/** Server -> Client: usage info per turn */
export const UsageResponse = 154

/** Server -> Client: TTS sentence start */
export const TTSSentenceStart = 350

/** Server -> Client: TTS sentence end */
export const TTSSentenceEnd = 351

/** Server -> Client: TTS audio data (binary) */
export const TTSResponse = 352

/** Server -> Client: TTS ended for this turn */
export const TTSEnded = 359

/** Server -> Client: ASR first byte detected (user speaking) */
export const ASRInfo = 450

/** Server -> Client: ASR text result (partial or final) */
export const ASRResponse = 451

/** Server -> Client: ASR recognition ended */
export const ASREnded = 459

/** Server -> Client: chat/dialogue response text */
export const ChatResponse = 550

/** Server -> Client: ChatTextQuery confirmed */
export const ChatTextQueryConfirmed = 553

/** Server -> Client: chat ended */
export const ChatEnded = 559

/** Server -> Client: dialog common error */
export const DialogCommonError = 599

// Legacy aliases for backward compatibility
export const ASR_INFO = ASRInfo
export const ASR_RESPONSE = ASRResponse
export const ASR_ENDED = ASREnded
export const TTS_SENTENCE_START = TTSSentenceStart
export const TTS_ENDED = TTSEnded
export const CHAT_RESPONSE = ChatResponse
export const AudioData = TaskRequest
