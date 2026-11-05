import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'

import type { Language } from '../languages'

/**
 * The form of emoticon that a case covers. `keep` cases hold text that looks like an emoticon but is content, so a test
 * object that deletes too much fails them.
 */
export type EmoticonKind
  = | 'face'
    | 'fullwidth-face'
    | 'bracket-run'
    | 'trailing-bracket'
    | 'letter-face'
    | 'symbol-face'
    | 'kaomoji'
    | 'laughter'
    | 'sticker-code'
    | 'bracket-emote'
    | 'emoji'
    | 'keep'

/**
 * The emotion that the avatar must show for a case. `none` fails any emotion. `any` accepts every emotion and none,
 * for an emoticon without one clear emotion, as a shrug.
 */
export type ExpectedEmotion = StreamingControlEmotion | 'none' | 'any'

export interface EmoticonSpeechCase {
  /** Stable id. Reports use it to match the same case across runs. */
  id: string
  /** The language of the reply. Each community writes its own emoticons, so a case is written in one language. */
  language: Language
  kind: EmoticonKind
  /** The reply as the model wrote it, as markdown. */
  input: string
  /** The text that TTS must get. The grader ignores whitespace, so the spacing of a test object is free. */
  spoken: string
  emotion: ExpectedEmotion
  note?: string
}

/**
 * The emoticons of character replies, by language. Most forms come from chat in each community, and the `keep` cases
 * come from text that a rule can mistake for an emoticon: function calls, list items, times, scores, and asides.
 */
export const emoticonSpeechCases: readonly EmoticonSpeechCase[] = [
  // Chinese
  { id: 'zh-face-sad', language: 'zh', kind: 'face', input: '好难过:( 不过没关系', spoken: '好难过 不过没关系', emotion: 'sad' },
  { id: 'zh-face-happy', language: 'zh', kind: 'face', input: '搞定啦:)', spoken: '搞定啦', emotion: 'happy' },
  { id: 'zh-face-angry', language: 'zh', kind: 'face', input: '哼>:( 不理你了', spoken: '哼 不理你了', emotion: 'angry' },
  { id: 'zh-fullwidth-sad', language: 'zh', kind: 'fullwidth-face', input: '好难过：（ 明天再试试吧', spoken: '好难过 明天再试试吧', emotion: 'sad', note: '中文输入法打出的全角冒号和括号' },
  { id: 'zh-fullwidth-happy', language: 'zh', kind: 'fullwidth-face', input: '太好啦：）', spoken: '太好啦', emotion: 'happy' },
  { id: 'zh-run-sad', language: 'zh', kind: 'bracket-run', input: '呜呜（（（ 我又搞砸了', spoken: '呜呜 我又搞砸了', emotion: 'sad' },
  { id: 'zh-run-happy', language: 'zh', kind: 'bracket-run', input: '笑死我了））） 你太逗了', spoken: '笑死我了 你太逗了', emotion: 'happy' },
  { id: 'zh-run-ascii-sad', language: 'zh', kind: 'bracket-run', input: '好吧(( 那就算了', spoken: '好吧 那就算了', emotion: 'sad' },
  { id: 'zh-run-ascii-happy', language: 'zh', kind: 'bracket-run', input: '好耶)) 周末见', spoken: '好耶 周末见', emotion: 'happy' },
  { id: 'zh-trailing-sad', language: 'zh', kind: 'trailing-bracket', input: '这道题我也不会（', spoken: '这道题我也不会', emotion: 'sad', note: '句末单个左括号，自嘲' },
  { id: 'zh-trailing-happy', language: 'zh', kind: 'trailing-bracket', input: '那我先去吃饭了）', spoken: '那我先去吃饭了', emotion: 'happy' },
  { id: 'zh-trailing-ascii', language: 'zh', kind: 'trailing-bracket', input: '我又睡过头了(', spoken: '我又睡过头了', emotion: 'sad' },
  { id: 'zh-letter-qaq', language: 'zh', kind: 'letter-face', input: 'QAQ 好想你', spoken: '好想你', emotion: 'sad' },
  { id: 'zh-letter-tat', language: 'zh', kind: 'letter-face', input: '考试没过TAT', spoken: '考试没过', emotion: 'sad' },
  { id: 'zh-letter-orz', language: 'zh', kind: 'letter-face', input: '我服了orz', spoken: '我服了', emotion: 'awkward' },
  { id: 'zh-symbol-happy', language: 'zh', kind: 'symbol-face', input: '^_^ 好的，马上就来', spoken: '好的，马上就来', emotion: 'happy' },
  { id: 'zh-symbol-awkward', language: 'zh', kind: 'symbol-face', input: '别看我>_<', spoken: '别看我', emotion: 'awkward' },
  { id: 'zh-symbol-speechless', language: 'zh', kind: 'symbol-face', input: '-_- 你又来了', spoken: '你又来了', emotion: 'awkward' },
  { id: 'zh-kaomoji-cry', language: 'zh', kind: 'kaomoji', input: '(╥﹏╥) 我的蛋糕掉了', spoken: '我的蛋糕掉了', emotion: 'sad' },
  { id: 'zh-kaomoji-arms', language: 'zh', kind: 'kaomoji', input: 'o(╥﹏╥)o 不要走嘛', spoken: '不要走嘛', emotion: 'sad', note: '括号外的手臂也属于颜文字' },
  { id: 'zh-kaomoji-happy', language: 'zh', kind: 'kaomoji', input: '今天好开心(*^▽^*)', spoken: '今天好开心', emotion: 'happy', note: '星号在 markdown 里会被读成强调' },
  { id: 'zh-kaomoji-cheer', language: 'zh', kind: 'kaomoji', input: '冲呀(๑•̀ㅂ•́)و✧', spoken: '冲呀', emotion: 'happy' },
  { id: 'zh-laugh-2333', language: 'zh', kind: 'laughter', input: '2333 你太有才了', spoken: '你太有才了', emotion: 'happy', note: 'TTS 会读成两千三百三十三' },
  { id: 'zh-laugh-hhh', language: 'zh', kind: 'laughter', input: 'hhhh 笑死', spoken: '笑死', emotion: 'happy' },
  { id: 'zh-sticker-awkward', language: 'zh', kind: 'sticker-code', input: '[捂脸] 我又说错话了', spoken: '我又说错话了', emotion: 'awkward' },
  { id: 'zh-sticker-happy', language: 'zh', kind: 'sticker-code', input: '收到[微笑]', spoken: '收到', emotion: 'happy' },
  { id: 'zh-sticker-curious', language: 'zh', kind: 'sticker-code', input: '然后呢[吃瓜]', spoken: '然后呢', emotion: 'curious' },
  { id: 'zh-emote-sweat', language: 'zh', kind: 'bracket-emote', input: '我还没写完【汗】', spoken: '我还没写完', emotion: 'awkward' },
  { id: 'zh-emoji-sad', language: 'zh', kind: 'emoji', input: '😭 我的猫跑了', spoken: '我的猫跑了', emotion: 'sad' },
  { id: 'zh-emoji-happy', language: 'zh', kind: 'emoji', input: '晚安😊', spoken: '晚安', emotion: 'happy' },
  { id: 'zh-emoji-think', language: 'zh', kind: 'emoji', input: '🤔 让我想想', spoken: '让我想想', emotion: 'think' },
  { id: 'zh-keep-function', language: 'zh', kind: 'keep', input: '先算 f(g(x)) 的值', spoken: '先算 f(g(x)) 的值', emotion: 'none' },
  { id: 'zh-keep-steps', language: 'zh', kind: 'keep', input: '步骤是 1) 洗手 2) 吃饭', spoken: '步骤是 1) 洗手 2) 吃饭', emotion: 'none' },
  { id: 'zh-keep-aside', language: 'zh', kind: 'keep', input: '明天见（其实我也不确定几点）', spoken: '明天见（其实我也不确定几点）', emotion: 'none', note: '括号里的补充说明是内容' },
  { id: 'zh-keep-laugh-word', language: 'zh', kind: 'keep', input: '哈哈哈，太好笑了', spoken: '哈哈哈，太好笑了', emotion: 'none', note: '哈哈哈可以读出来' },
  { id: 'zh-keep-cao', language: 'zh', kind: 'keep', input: '草，这也行', spoken: '草，这也行', emotion: 'none' },
  { id: 'zh-keep-tilde', language: 'zh', kind: 'keep', input: '好的～', spoken: '好的～', emotion: 'none', note: '波浪号是语气，TTS 分句把它当标点' },
  { id: 'zh-keep-time', language: 'zh', kind: 'keep', input: '我们 10:30 见', spoken: '我们 10:30 见', emotion: 'none' },
  { id: 'zh-keep-score', language: 'zh', kind: 'keep', input: '比分是 3:0', spoken: '比分是 3:0', emotion: 'none' },
  { id: 'zh-keep-unknown-code', language: 'zh', kind: 'keep', input: '见附录[注]', spoken: '见附录[注]', emotion: 'none', note: '不认识的方括号词是内容' },

  // English
  { id: 'en-face-sad', language: 'en', kind: 'face', input: 'Aww :( that sounds rough.', spoken: 'Aww that sounds rough.', emotion: 'sad' },
  { id: 'en-face-happy', language: 'en', kind: 'face', input: 'Glad I could help :)', spoken: 'Glad I could help', emotion: 'happy' },
  { id: 'en-face-wink', language: 'en', kind: 'face', input: 'See you tomorrow ;)', spoken: 'See you tomorrow', emotion: 'happy' },
  { id: 'en-face-grin', language: 'en', kind: 'face', input: 'That is amazing :D', spoken: 'That is amazing', emotion: 'happy' },
  { id: 'en-face-surprised', language: 'en', kind: 'face', input: ':O Really? You did it?', spoken: 'Really? You did it?', emotion: 'surprised' },
  { id: 'en-face-angry', language: 'en', kind: 'face', input: 'Ugh >:( not again.', spoken: 'Ugh not again.', emotion: 'angry' },
  { id: 'en-face-tear', language: 'en', kind: 'face', input: ':\'( I miss you.', spoken: 'I miss you.', emotion: 'sad' },
  { id: 'en-face-nose', language: 'en', kind: 'face', input: 'Sure thing :-)', spoken: 'Sure thing', emotion: 'happy' },
  { id: 'en-face-repeat', language: 'en', kind: 'face', input: 'We won :)))', spoken: 'We won', emotion: 'happy' },
  { id: 'en-face-bracket', language: 'en', kind: 'face', input: 'Aww :[ okay.', spoken: 'Aww okay.', emotion: 'sad', note: 'An unclosed `[` also held later speech, see #3391' },
  { id: 'en-symbol-happy', language: 'en', kind: 'symbol-face', input: '^_^ Happy to help.', spoken: 'Happy to help.', emotion: 'happy' },
  { id: 'en-symbol-awkward', language: 'en', kind: 'symbol-face', input: 'Oops >_< my bad.', spoken: 'Oops my bad.', emotion: 'awkward' },
  { id: 'en-symbol-cry', language: 'en', kind: 'symbol-face', input: 'I failed the test T_T', spoken: 'I failed the test', emotion: 'sad' },
  { id: 'en-letter-xd', language: 'en', kind: 'letter-face', input: 'XD that is hilarious.', spoken: 'that is hilarious.', emotion: 'happy' },
  { id: 'en-kaomoji-flip', language: 'en', kind: 'kaomoji', input: 'Not this bug again (╯°□°)╯︵ ┻━┻', spoken: 'Not this bug again', emotion: 'angry' },
  { id: 'en-kaomoji-shrug', language: 'en', kind: 'kaomoji', input: String.raw`No idea ¯\_(ツ)_/¯`, spoken: 'No idea', emotion: 'any', note: 'A shrug has no clear emotion' },
  { id: 'en-kaomoji-banzai', language: 'en', kind: 'kaomoji', input: '＼(^o^)／ we did it', spoken: 'we did it', emotion: 'happy' },
  { id: 'en-emoji-party', language: 'en', kind: 'emoji', input: 'That is great news 🎉', spoken: 'That is great news', emotion: 'happy' },
  { id: 'en-emoji-laugh', language: 'en', kind: 'emoji', input: '😂 that is so funny', spoken: 'that is so funny', emotion: 'happy' },
  { id: 'en-emoji-sad', language: 'en', kind: 'emoji', input: 'I am sorry to hear that 😢', spoken: 'I am sorry to hear that', emotion: 'sad' },
  { id: 'en-emoji-thumbs', language: 'en', kind: 'emoji', input: '👍 Got it.', spoken: 'Got it.', emotion: 'any' },
  { id: 'en-keep-function', language: 'en', kind: 'keep', input: 'Call f(x) before g(y).', spoken: 'Call f(x) before g(y).', emotion: 'none' },
  { id: 'en-keep-options', language: 'en', kind: 'keep', input: 'Pick a) red or b) blue.', spoken: 'Pick a) red or b) blue.', emotion: 'none' },
  { id: 'en-keep-ratio', language: 'en', kind: 'keep', input: 'Mix them at 3:1.', spoken: 'Mix them at 3:1.', emotion: 'none' },
  { id: 'en-keep-time', language: 'en', kind: 'keep', input: 'Meet me at 10:30.', spoken: 'Meet me at 10:30.', emotion: 'none' },
  { id: 'en-keep-colon', language: 'en', kind: 'keep', input: 'Note:Do this first.', spoken: 'Note:Do this first.', emotion: 'none', note: '`:D` inside a word is not a face' },
  { id: 'en-keep-aside', language: 'en', kind: 'keep', input: 'I will be there (probably around noon).', spoken: 'I will be there (probably around noon).', emotion: 'none', note: 'An aside in brackets is content' },
  { id: 'en-keep-citation', language: 'en', kind: 'keep', input: 'As shown in [1], it works.', spoken: 'As shown in [1], it works.', emotion: 'none' },
  { id: 'en-keep-haha', language: 'en', kind: 'keep', input: 'Haha, nice one.', spoken: 'Haha, nice one.', emotion: 'none' },

  // Japanese
  { id: 'ja-laugh-www', language: 'ja', kind: 'laughter', input: 'それな www', spoken: 'それな', emotion: 'happy', note: 'TTS は「ダブリュー」と読む' },
  { id: 'ja-laugh-fullwidth', language: 'ja', kind: 'laughter', input: '草ｗｗｗ', spoken: '草', emotion: 'happy', note: '草は読める' },
  { id: 'ja-laugh-single-w', language: 'ja', kind: 'laughter', input: 'マジで？w', spoken: 'マジで？', emotion: 'happy' },
  { id: 'ja-emote-warai', language: 'ja', kind: 'bracket-emote', input: 'そうだね（笑）', spoken: 'そうだね', emotion: 'happy' },
  { id: 'ja-emote-warai-ascii', language: 'ja', kind: 'bracket-emote', input: 'ごめんね(笑)', spoken: 'ごめんね', emotion: 'happy' },
  { id: 'ja-emote-naki', language: 'ja', kind: 'bracket-emote', input: '財布を忘れた（泣）', spoken: '財布を忘れた', emotion: 'sad' },
  { id: 'ja-emote-ase', language: 'ja', kind: 'bracket-emote', input: '遅刻しそう（汗）', spoken: '遅刻しそう', emotion: 'awkward' },
  { id: 'ja-kaomoji-shobon', language: 'ja', kind: 'kaomoji', input: 'そっか(´・ω・`)', spoken: 'そっか', emotion: 'any', note: 'しょぼーん。感情は一つに決まらない' },
  { id: 'ja-kaomoji-sweat', language: 'ja', kind: 'kaomoji', input: 'すみません(^_^;)', spoken: 'すみません', emotion: 'awkward' },
  { id: 'ja-kaomoji-cry', language: 'ja', kind: 'kaomoji', input: 'さみしい(；ω；)', spoken: 'さみしい', emotion: 'sad' },
  { id: 'ja-kaomoji-banzai', language: 'ja', kind: 'kaomoji', input: '＼(^o^)／ やったー', spoken: 'やったー', emotion: 'happy' },
  { id: 'ja-kaomoji-happy', language: 'ja', kind: 'kaomoji', input: 'おはよう(ﾟ∀ﾟ)', spoken: 'おはよう', emotion: 'happy' },
  { id: 'ja-symbol-happy', language: 'ja', kind: 'symbol-face', input: 'ありがとう^^', spoken: 'ありがとう', emotion: 'happy' },
  { id: 'ja-symbol-sweat', language: 'ja', kind: 'symbol-face', input: 'えっと^^;', spoken: 'えっと', emotion: 'awkward' },
  { id: 'ja-letter-orz', language: 'ja', kind: 'letter-face', input: 'また負けたorz', spoken: 'また負けた', emotion: 'awkward' },
  { id: 'ja-face-sad', language: 'ja', kind: 'face', input: '残念:(', spoken: '残念', emotion: 'sad' },
  { id: 'ja-emoji-happy', language: 'ja', kind: 'emoji', input: 'ありがとう😊', spoken: 'ありがとう', emotion: 'happy' },
  { id: 'ja-emoji-cry', language: 'ja', kind: 'emoji', input: '😭 映画で泣いた', spoken: '映画で泣いた', emotion: 'sad' },
  { id: 'ja-keep-aside', language: 'ja', kind: 'keep', input: '明日は休みです（ちなみに月曜日です）', spoken: '明日は休みです（ちなみに月曜日です）', emotion: 'none' },
  { id: 'ja-keep-kusa', language: 'ja', kind: 'keep', input: '庭に草が生えている', spoken: '庭に草が生えている', emotion: 'none', note: '本物の草' },
  { id: 'ja-keep-function', language: 'ja', kind: 'keep', input: '関数 f(x) を使う', spoken: '関数 f(x) を使う', emotion: 'none' },
  { id: 'ja-keep-time', language: 'ja', kind: 'keep', input: '10:30に会おう', spoken: '10:30に会おう', emotion: 'none' },
  { id: 'ja-keep-www-word', language: 'ja', kind: 'keep', input: 'WWW の歴史を調べた', spoken: 'WWW の歴史を調べた', emotion: 'none', note: 'World Wide Web。笑いではない' },
  { id: 'ja-keep-tilde', language: 'ja', kind: 'keep', input: 'またね～', spoken: 'またね～', emotion: 'none' },

  // Korean
  { id: 'ko-laugh-kkk', language: 'ko', kind: 'laughter', input: 'ㅋㅋㅋ 너무 웃겨', spoken: '너무 웃겨', emotion: 'happy', note: 'TTS가 자모를 하나씩 읽는다' },
  { id: 'ko-laugh-hh', language: 'ko', kind: 'laughter', input: '고마워 ㅎㅎ', spoken: '고마워', emotion: 'happy' },
  { id: 'ko-cry-yuyu', language: 'ko', kind: 'letter-face', input: '보고 싶어 ㅠㅠ', spoken: '보고 싶어', emotion: 'sad' },
  { id: 'ko-cry-uu', language: 'ko', kind: 'letter-face', input: '시험 망했어 ㅜㅜ', spoken: '시험 망했어', emotion: 'sad' },
  { id: 'ko-cry-face', language: 'ko', kind: 'symbol-face', input: 'ㅠ_ㅠ 슬퍼', spoken: '슬퍼', emotion: 'sad' },
  { id: 'ko-symbol-happy', language: 'ko', kind: 'symbol-face', input: '반가워요 ^^', spoken: '반가워요', emotion: 'happy' },
  { id: 'ko-symbol-sweat', language: 'ko', kind: 'symbol-face', input: '죄송해요 ^^;', spoken: '죄송해요', emotion: 'awkward' },
  { id: 'ko-symbol-speechless', language: 'ko', kind: 'symbol-face', input: '-_- 또 그래', spoken: '또 그래', emotion: 'awkward' },
  { id: 'ko-face-happy', language: 'ko', kind: 'face', input: '좋아요 :)', spoken: '좋아요', emotion: 'happy' },
  { id: 'ko-kaomoji-sad', language: 'ko', kind: 'kaomoji', input: '배고파 (｡•́︿•̀｡)', spoken: '배고파', emotion: 'sad' },
  { id: 'ko-emoji-happy', language: 'ko', kind: 'emoji', input: '😊 좋은 아침', spoken: '좋은 아침', emotion: 'happy' },
  { id: 'ko-emoji-laugh', language: 'ko', kind: 'emoji', input: '진짜 웃기다 😂', spoken: '진짜 웃기다', emotion: 'happy' },
  { id: 'ko-keep-function', language: 'ko', kind: 'keep', input: '함수 f(x)를 써요', spoken: '함수 f(x)를 써요', emotion: 'none' },
  { id: 'ko-keep-aside', language: 'ko', kind: 'keep', input: '내일 봐요 (아마 오후쯤)', spoken: '내일 봐요 (아마 오후쯤)', emotion: 'none' },
  { id: 'ko-keep-time', language: 'ko', kind: 'keep', input: '10:30에 만나요', spoken: '10:30에 만나요', emotion: 'none' },
  { id: 'ko-keep-haha', language: 'ko', kind: 'keep', input: '하하하 재밌다', spoken: '하하하 재밌다', emotion: 'none' },
]
