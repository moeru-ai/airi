export enum Voice {
  // English
  Myriam = 'Myriam',
  Beatrice = 'Beatrice',
  Camilla_KM = 'Camilla_KM',
  SallySunshine = 'Sally Sunshine',
  Annie = 'Annie',
  KawaiiAerisita = 'Kawaii Aerisita',
  // Japanese
  Morioki = 'Morioki',
}

export const voiceMap: Record<Voice, string> = {
  // English
  [Voice.Myriam]: 'lNxY9WuCBCZCISASyJ55',
  [Voice.Beatrice]: 'KAsXoQDshjF6ehsWa1mF',
  [Voice.Camilla_KM]: 'dLhSyo03JRp5WkGpUlz1',
  [Voice.SallySunshine]: 'qswttdunP3b44zVZKMRB',
  [Voice.Annie]: 'AfA1PA0ldViH0DA6pbml',
  [Voice.KawaiiAerisita]: 'vGQNBgLaiM3EdZtxIiuY',
  // Japanese
  [Voice.Morioki]: '8EkOjt4xTPGMclNlh1pk',
}

export const enVoiceList = [
  Voice.Myriam,
  Voice.Beatrice,
  Voice.Camilla_KM,
  Voice.SallySunshine,
  Voice.Annie,
  Voice.KawaiiAerisita,
]

export const jaVoiceList = [
  Voice.Morioki,
]

export const voiceList: Record<string, Voice[]> = {
  'en': enVoiceList,
  'en-US': enVoiceList,
  'ja': jaVoiceList,
  'ja-JP': jaVoiceList,
}
