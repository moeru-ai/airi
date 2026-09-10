export const models = [
  {
    model_id: 'eleven_multilingual_v2',
    name: 'Eleven Multilingual v2',
    can_be_finetuned: true,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: true,
    can_use_speaker_boost: true,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our most life-like, emotionally rich mode in 29 languages. Best for voice overs, audiobooks, post-production, or any other content creation needs.',
    requires_alpha_access: false,
    max_characters_request_free_user: 10000,
    max_characters_request_subscribed_user: 10000,
    maximum_text_length_per_request: 10000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
      {
        language_id: 'ja',
        name: 'Japanese',
      },
      {
        language_id: 'zh',
        name: 'Chinese',
      },
      {
        language_id: 'de',
        name: 'German',
      },
      {
        language_id: 'hi',
        name: 'Hindi',
      },
      {
        language_id: 'fr',
        name: 'French',
      },
      {
        language_id: 'ko',
        name: 'Korean',
      },
      {
        language_id: 'pt',
        name: 'Portuguese',
      },
      {
        language_id: 'it',
        name: 'Italian',
      },
      {
        language_id: 'es',
        name: 'Spanish',
      },
      {
        language_id: 'id',
        name: 'Indonesian',
      },
      {
        language_id: 'nl',
        name: 'Dutch',
      },
      {
        language_id: 'tr',
        name: 'Turkish',
      },
      {
        language_id: 'fil',
        name: 'Filipino',
      },
      {
        language_id: 'pl',
        name: 'Polish',
      },
      {
        language_id: 'sv',
        name: 'Swedish',
      },
      {
        language_id: 'bg',
        name: 'Bulgarian',
      },
      {
        language_id: 'ro',
        name: 'Romanian',
      },
      {
        language_id: 'ar',
        name: 'Arabic',
      },
      {
        language_id: 'cs',
        name: 'Czech',
      },
      {
        language_id: 'el',
        name: 'Greek',
      },
      {
        language_id: 'fi',
        name: 'Finnish',
      },
      {
        language_id: 'hr',
        name: 'Croatian',
      },
      {
        language_id: 'ms',
        name: 'Malay',
      },
      {
        language_id: 'sk',
        name: 'Slovak',
      },
      {
        language_id: 'da',
        name: 'Danish',
      },
      {
        language_id: 'ta',
        name: 'Tamil',
      },
      {
        language_id: 'uk',
        name: 'Ukrainian',
      },
      {
        language_id: 'ru',
        name: 'Russian',
      },
    ],
    model_rates: {
      character_cost_multiplier: 1,
    },
    concurrency_group: 'standard',
  },
  {
    model_id: 'eleven_flash_v2_5',
    name: 'Eleven Flash v2.5',
    can_be_finetuned: true,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our ultra low latency model in 32 languages. Ideal for conversational use cases.',
    requires_alpha_access: false,
    max_characters_request_free_user: 40000,
    max_characters_request_subscribed_user: 40000,
    maximum_text_length_per_request: 40000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
      {
        language_id: 'ja',
        name: 'Japanese',
      },
      {
        language_id: 'zh',
        name: 'Chinese',
      },
      {
        language_id: 'de',
        name: 'German',
      },
      {
        language_id: 'hi',
        name: 'Hindi',
      },
      {
        language_id: 'fr',
        name: 'French',
      },
      {
        language_id: 'ko',
        name: 'Korean',
      },
      {
        language_id: 'pt',
        name: 'Portuguese',
      },
      {
        language_id: 'it',
        name: 'Italian',
      },
      {
        language_id: 'es',
        name: 'Spanish',
      },
      {
        language_id: 'ru',
        name: 'Russian',
      },
      {
        language_id: 'id',
        name: 'Indonesian',
      },
      {
        language_id: 'nl',
        name: 'Dutch',
      },
      {
        language_id: 'tr',
        name: 'Turkish',
      },
      {
        language_id: 'fil',
        name: 'Filipino',
      },
      {
        language_id: 'pl',
        name: 'Polish',
      },
      {
        language_id: 'sv',
        name: 'Swedish',
      },
      {
        language_id: 'bg',
        name: 'Bulgarian',
      },
      {
        language_id: 'ro',
        name: 'Romanian',
      },
      {
        language_id: 'ar',
        name: 'Arabic',
      },
      {
        language_id: 'cs',
        name: 'Czech',
      },
      {
        language_id: 'el',
        name: 'Greek',
      },
      {
        language_id: 'fi',
        name: 'Finnish',
      },
      {
        language_id: 'hr',
        name: 'Croatian',
      },
      {
        language_id: 'ms',
        name: 'Malay',
      },
      {
        language_id: 'sk',
        name: 'Slovak',
      },
      {
        language_id: 'da',
        name: 'Danish',
      },
      {
        language_id: 'ta',
        name: 'Tamil',
      },
      {
        language_id: 'uk',
        name: 'Ukrainian',
      },
      {
        language_id: 'hu',
        name: 'Hungarian',
      },
      {
        language_id: 'no',
        name: 'Norwegian',
      },
      {
        language_id: 'vi',
        name: 'Vietnamese',
      },
    ],
    model_rates: {
      character_cost_multiplier: 0.5,
    },
    concurrency_group: 'turbo',
  },
  {
    model_id: 'eleven_turbo_v2_5',
    name: 'Eleven Turbo v2.5',
    can_be_finetuned: true,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our high quality, low latency model in 32 languages. Best for developer use cases where speed matters and you need non-English languages.',
    requires_alpha_access: false,
    max_characters_request_free_user: 40000,
    max_characters_request_subscribed_user: 40000,
    maximum_text_length_per_request: 40000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
      {
        language_id: 'ja',
        name: 'Japanese',
      },
      {
        language_id: 'zh',
        name: 'Chinese',
      },
      {
        language_id: 'de',
        name: 'German',
      },
      {
        language_id: 'hi',
        name: 'Hindi',
      },
      {
        language_id: 'fr',
        name: 'French',
      },
      {
        language_id: 'ko',
        name: 'Korean',
      },
      {
        language_id: 'pt',
        name: 'Portuguese',
      },
      {
        language_id: 'it',
        name: 'Italian',
      },
      {
        language_id: 'es',
        name: 'Spanish',
      },
      {
        language_id: 'ru',
        name: 'Russian',
      },
      {
        language_id: 'id',
        name: 'Indonesian',
      },
      {
        language_id: 'nl',
        name: 'Dutch',
      },
      {
        language_id: 'tr',
        name: 'Turkish',
      },
      {
        language_id: 'fil',
        name: 'Filipino',
      },
      {
        language_id: 'pl',
        name: 'Polish',
      },
      {
        language_id: 'sv',
        name: 'Swedish',
      },
      {
        language_id: 'bg',
        name: 'Bulgarian',
      },
      {
        language_id: 'ro',
        name: 'Romanian',
      },
      {
        language_id: 'ar',
        name: 'Arabic',
      },
      {
        language_id: 'cs',
        name: 'Czech',
      },
      {
        language_id: 'el',
        name: 'Greek',
      },
      {
        language_id: 'fi',
        name: 'Finnish',
      },
      {
        language_id: 'hr',
        name: 'Croatian',
      },
      {
        language_id: 'ms',
        name: 'Malay',
      },
      {
        language_id: 'sk',
        name: 'Slovak',
      },
      {
        language_id: 'da',
        name: 'Danish',
      },
      {
        language_id: 'ta',
        name: 'Tamil',
      },
      {
        language_id: 'uk',
        name: 'Ukrainian',
      },
      {
        language_id: 'vi',
        name: 'Vietnamese',
      },
      {
        language_id: 'no',
        name: 'Norwegian',
      },
      {
        language_id: 'hu',
        name: 'Hungarian',
      },
    ],
    model_rates: {
      character_cost_multiplier: 0.5,
    },
    concurrency_group: 'turbo',
  },
  {
    model_id: 'eleven_turbo_v2',
    name: 'Eleven Turbo v2',
    can_be_finetuned: true,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our English-only, low latency model. Best for developer use cases where speed matters and you only need English. Performance is on par with Turbo v2.5.',
    requires_alpha_access: false,
    max_characters_request_free_user: 30000,
    max_characters_request_subscribed_user: 30000,
    maximum_text_length_per_request: 30000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
    ],
    model_rates: {
      character_cost_multiplier: 0.5,
    },
    concurrency_group: 'turbo',
  },
  {
    model_id: 'eleven_flash_v2',
    name: 'Eleven Flash v2',
    can_be_finetuned: true,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our ultra low latency model in english. Ideal for conversational use cases.',
    requires_alpha_access: false,
    max_characters_request_free_user: 30000,
    max_characters_request_subscribed_user: 30000,
    maximum_text_length_per_request: 30000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
    ],
    model_rates: {
      character_cost_multiplier: 0.5,
    },
    concurrency_group: 'turbo',
  },
  {
    model_id: 'eleven_english_sts_v2',
    name: 'Eleven English v2',
    can_be_finetuned: false,
    can_do_text_to_speech: false,
    can_do_voice_conversion: true,
    can_use_style: true,
    can_use_speaker_boost: true,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our state-of-the-art speech to speech model suitable for scenarios where you need maximum control over the content and prosody of your generations.',
    requires_alpha_access: false,
    max_characters_request_free_user: 5000,
    max_characters_request_subscribed_user: 5000,
    maximum_text_length_per_request: 5000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
    ],
    model_rates: {
      character_cost_multiplier: 1,
    },
    concurrency_group: 'standard',
  },
  {
    model_id: 'eleven_multilingual_v1',
    name: 'Eleven Multilingual v1',
    can_be_finetuned: false,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our first Multilingual model, capability of generating speech in 10 languages. Now outclassed by Multilingual v2 (for content creation) and Turbo v2.5 (for low latency use cases).',
    requires_alpha_access: false,
    max_characters_request_free_user: 10000,
    max_characters_request_subscribed_user: 10000,
    maximum_text_length_per_request: 10000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
      {
        language_id: 'de',
        name: 'German',
      },
      {
        language_id: 'pl',
        name: 'Polish',
      },
      {
        language_id: 'es',
        name: 'Spanish',
      },
      {
        language_id: 'it',
        name: 'Italian',
      },
      {
        language_id: 'fr',
        name: 'French',
      },
      {
        language_id: 'pt',
        name: 'Portuguese',
      },
      {
        language_id: 'hi',
        name: 'Hindi',
      },
      {
        language_id: 'ar',
        name: 'Arabic',
      },
    ],
    model_rates: {
      character_cost_multiplier: 1,
    },
    concurrency_group: 'standard',
  },
  {
    model_id: 'eleven_multilingual_sts_v2',
    name: 'Eleven Multilingual v2',
    can_be_finetuned: true,
    can_do_text_to_speech: false,
    can_do_voice_conversion: true,
    can_use_style: true,
    can_use_speaker_boost: true,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our cutting-edge, multilingual speech-to-speech model is designed for situations that demand unparalleled control over both the content and the prosody of the generated speech across various languages.',
    requires_alpha_access: false,
    max_characters_request_free_user: 10000,
    max_characters_request_subscribed_user: 10000,
    maximum_text_length_per_request: 10000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
      {
        language_id: 'ja',
        name: 'Japanese',
      },
      {
        language_id: 'zh',
        name: 'Chinese',
      },
      {
        language_id: 'de',
        name: 'German',
      },
      {
        language_id: 'hi',
        name: 'Hindi',
      },
      {
        language_id: 'fr',
        name: 'French',
      },
      {
        language_id: 'ko',
        name: 'Korean',
      },
      {
        language_id: 'pt',
        name: 'Portuguese',
      },
      {
        language_id: 'it',
        name: 'Italian',
      },
      {
        language_id: 'es',
        name: 'Spanish',
      },
      {
        language_id: 'ru',
        name: 'Russian',
      },
      {
        language_id: 'id',
        name: 'Indonesian',
      },
      {
        language_id: 'nl',
        name: 'Dutch',
      },
      {
        language_id: 'tr',
        name: 'Turkish',
      },
      {
        language_id: 'fil',
        name: 'Filipino',
      },
      {
        language_id: 'pl',
        name: 'Polish',
      },
      {
        language_id: 'sv',
        name: 'Swedish',
      },
      {
        language_id: 'bg',
        name: 'Bulgarian',
      },
      {
        language_id: 'ro',
        name: 'Romanian',
      },
      {
        language_id: 'ar',
        name: 'Arabic',
      },
      {
        language_id: 'cs',
        name: 'Czech',
      },
      {
        language_id: 'el',
        name: 'Greek',
      },
      {
        language_id: 'fi',
        name: 'Finnish',
      },
      {
        language_id: 'hr',
        name: 'Croatian',
      },
      {
        language_id: 'ms',
        name: 'Malay',
      },
      {
        language_id: 'sk',
        name: 'Slovak',
      },
      {
        language_id: 'da',
        name: 'Danish',
      },
      {
        language_id: 'ta',
        name: 'Tamil',
      },
      {
        language_id: 'uk',
        name: 'Ukrainian',
      },
    ],
    model_rates: {
      character_cost_multiplier: 1,
    },
    concurrency_group: 'standard',
  },
  {
    model_id: 'eleven_monolingual_v1',
    name: 'Eleven English v1',
    can_be_finetuned: false,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: false,
    can_use_speaker_boost: false,
    serves_pro_voices: false,
    token_cost_factor: 1,
    description: 'Our first ever text to speech model. Now outclassed by Multilingual v2 (for content creation) and Turbo v2.5 (for low latency use cases).',
    requires_alpha_access: false,
    max_characters_request_free_user: 10000,
    max_characters_request_subscribed_user: 10000,
    maximum_text_length_per_request: 10000,
    languages: [
      {
        language_id: 'en',
        name: 'English',
      },
    ],
    model_rates: {
      character_cost_multiplier: 1,
    },
    concurrency_group: 'standard',
  },
]
