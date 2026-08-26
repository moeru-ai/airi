import type { DefaultTheme } from 'vitepress'

import type { ThemeConfig } from './theme/config'

import { join, posix, resolve } from 'node:path'
import { env } from 'node:process'

import i18n from '@intlify/unplugin-vue-i18n/vite'
import anchor from 'markdown-it-anchor'
import unocss from 'unocss/vite'
import yaml from 'unplugin-yaml/vite'

import { footnote } from '@mdit/plugin-footnote'
import { tasklist } from '@mdit/plugin-tasklist'
import { defineConfig, postcssIsolateStyles } from 'vitepress'

import { version } from '../../package.json'
import { webLive } from './constants'
import { teamMembers } from './contributors'
import {
  discord,
  github,
  ogImage,
  ogUrl,
  projectDescription,
  projectName,
  projectShortName,
  releases,
  x,
} from './meta'
import { frontmatterAssets } from './plugins/vite-frontmatter-assets'

function withBase(url: string) {
  return env.BASE_URL
    ? env.BASE_URL.endsWith('/')
      ? posix.join(env.BASE_URL.replace(/\/$/, ''), url)
      : posix.join(env.BASE_URL, url)
    : url
}

// https://vitepress.dev/reference/site-config
export default defineConfig<ThemeConfig>({
  appearance: 'dark',
  base: env.BASE_URL || '/',
  cleanUrls: true,
  description: projectDescription,
  head: [
    ['meta', { content: '#0b0d0f', name: 'theme-color' }],
    ['link', { href: '/favicon.svg', rel: 'icon', sizes: 'any', type: 'image/svg+xml' }],
    ['link', { href: '/apple-touch-icon.png', rel: 'apple-touch-icon', sizes: '180x180' }],
    ['meta', { content: projectName, name: 'apple-mobile-web-app-title' }],
    ['meta', { content: 'yes', name: 'apple-mobile-web-app-capable' }],
    ['meta', { content: `${teamMembers.map(c => c.name).join(', ')} and ${projectName} contributors`, name: 'author' }],
    ['meta', { content: '', name: 'keywords' }],
    ['meta', { content: projectName, property: 'og:title' }],
    ['meta', { content: projectName, property: 'og:site_name' }],
    ['meta', { content: ogImage, property: 'og:image' }],
    ['meta', { content: projectDescription, property: 'og:description' }],
    ['meta', { content: ogUrl, property: 'og:url' }],
    ['meta', { content: projectName, name: 'twitter:title' }],
    ['meta', { content: projectDescription, name: 'twitter:description' }],
    ['meta', { content: ogImage, name: 'twitter:image' }],
    ['meta', { content: 'summary_large_image', name: 'twitter:card' }],
    ['link', { color: '#ffffff', href: '/logo.svg', rel: 'mask-icon' }],
    ['script', {}, `
      ;(function () {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const setting = localStorage.getItem('vueuse-color-scheme') || 'auto'
        if (setting === 'light' || (prefersDark && setting !== 'dark')) {
          document.querySelector('#themeColor')?.setAttribute('content', 'rgb(255,255,255)')
        }
      })()
    `],
  ],
  ignoreDeadLinks: true,
  lastUpdated: true,
  locales: {
    'ja': {
      label: '日本語',
      lang: 'ja',
      themeConfig: {
        darkModeSwitchLabel: '外観モード',
        docFooter: {
          next: '次のページ',
          prev: '前のページ',
        },
        editLink: {
          pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
          text: 'GitHub でこのページを編集',
        },
        homepage: {
          buttons: [
            {
              link: webLive,
              primary: true,
              target: '_self',
              text: 'ライブ版を試す',
            },
            {
              link: withBase('/ja/docs/overview/versions'),
              text: 'ダウンロード',
            },
            {
              link: withBase('/ja/docs/overview/'),
              text: 'はじめに',
            },
          ],
        },
        langMenuLabel: '言語を変更',
        lastUpdated: {
          text: '最終更新',
        },
        logo: withBase('/favicon.svg'),
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { link: withBase('/ja/docs/overview/'), text: 'ドキュメント' },
          { link: withBase('/ja/blog/'), text: 'ブログ' },
          {
            items: [
              { link: releases, text: 'リリースノート' },
            ],
            text: `v${version}`,
          },
          {
            items: [
              { link: withBase('/ja/about/privacy'), text: 'プライバシーポリシー' },
              { link: withBase('/ja/about/terms'), text: '利用規約' },
            ],
            text: '概要',
          },
        ],
        outline: {
          label: 'このページの内容',
          level: 'deep',
        },
        returnToTopLabel: 'トップに戻る',

        sidebar: [
          {
            icon: 'lucide:rocket',
            items: [
              { link: withBase('/ja/docs/overview/'), text: 'はじめに' },
              { link: withBase('/ja/docs/overview/versions'), text: 'バージョンとダウンロード' },
              { link: withBase('/ja/docs/overview/about-ai-vtuber'), text: 'AI VTuberについて' },
              { link: withBase('/ja/docs/overview/about-neuro-sama'), text: 'Neuro-samaについて' },
              { link: withBase('/ja/docs/overview/other-similar-projects'), text: 'その他の類似プロジェクト' },
            ],
            text: '概要',
          },
          {
            icon: 'lucide:book-open',
            items: [
              {
                items: [
                  { link: withBase('/ja/docs/manual/tamagotchi/'), text: 'デスクトップ版' },
                  { link: withBase('/ja/docs/manual/web/'), text: 'Web版' },
                ],
                text: 'クイックスタート',
              },
              {
                items: [
                  { link: withBase('/ja/docs/manual/config/'), text: '設定ガイド' },
                ],
                text: '設定',
              },
            ],
            link: withBase('/ja/docs/manual/'),
            text: 'マニュアル',
          },
          {
            icon: 'lucide:users',
            items: [
              {
                items: [
                  { link: withBase('/ja/docs/contributing/'), text: '環境構築と事前準備' },
                  { link: withBase('/ja/docs/contributing/tamagotchi'), text: 'デスクトップアプリ' },
                  { link: withBase('/ja/docs/contributing/webui'), text: 'Web UI' },
                  { link: withBase('/ja/docs/contributing/docs'), text: 'ドキュメントサイト' },
                ],
                text: '基本設定と開発',
              },
              {
                items: [
                  { link: withBase('/ja/docs/contributing/services/minecraft'), text: 'Minecraft' },
                  { link: withBase('/ja/docs/contributing/services/satori'), text: 'Satori Bot' },
                  { link: withBase('/ja/docs/contributing/services/telegram'), text: 'Telegram Bot' },
                  { link: withBase('/ja/docs/contributing/services/discord'), text: 'Discord Bot' },
                ],
                text: 'ゲーム＆ソーシャルプラットフォーム',
              },
              {
                items: [
                  { link: withBase('/ja/docs/contributing/design-guidelines/'), text: 'はじめに' },
                  { link: withBase('/ja/docs/contributing/design-guidelines/resources'), text: 'アーティストと開発者 (参考リソース)' },
                  { link: withBase('/ja/docs/contributing/design-guidelines/tools'), text: 'ツール' },
                ],
                text: 'デザインガイドライン',
              },
            ],
            text: 'コントリビューション',
          },
          {
            icon: 'lucide:calendar-days',
            items: [
              { link: withBase('/ja/docs/chronicles/version-v0.1.0/'), text: '初公開 v0.1.0' },
              { link: withBase('/ja/docs/chronicles/version-v0.0.1/'), text: '前日譚 v0.0.1' },
            ],
            text: '年表',
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],

        sidebarMenuLabel: 'メニュー',
      },
    },
    'ko': {
      label: '한국어',
      lang: 'ko',
      themeConfig: {
        darkModeSwitchLabel: '테마',
        docFooter: {
          next: '다음 페이지',
          prev: '이전 페이지',
        },
        editLink: {
          pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
          text: 'GitHub에서 이 페이지 편집하기',
        },
        homepage: {
          buttons: [
            {
              link: webLive,
              primary: true,
              target: '_self',
              text: '라이브 데모 체험하기',
            },
            {
              link: withBase('/ko/docs/overview/versions'),
              text: '다운로드',
            },
            {
              link: withBase('/ko/docs/overview/'),
              text: '시작하기',
            },
          ],
        },
        langMenuLabel: '언어 변경',
        lastUpdated: {
          text: '마지막 업데이트',
        },
        logo: withBase('/favicon.svg'),
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { link: withBase('/ko/docs/overview/'), text: '문서' },
          { link: withBase('/ko/blog/'), text: '블로그' },
          {
            items: [
              { link: releases, text: '릴리스 노트' },
            ],
            text: `v${version}`,
          },
          {
            items: [
              { link: withBase('/ko/about/privacy'), text: '개인정보 처리방침' },
              { link: withBase('/ko/about/terms'), text: '이용약관' },
            ],
            text: '소개',
          },
        ],
        outline: {
          label: '이 페이지의 내용',
          level: 'deep',
        },
        returnToTopLabel: '맨 위로',

        sidebar: [
          {
            icon: 'lucide:rocket',
            items: [
              { link: withBase('/ko/docs/overview/'), text: '소개' },
              { link: withBase('/ko/docs/overview/versions'), text: '버전과 다운로드' },
              { link: withBase('/ko/docs/overview/about-ai-vtuber'), text: 'AI VTuber란' },
              { link: withBase('/ko/docs/overview/about-neuro-sama'), text: 'Neuro-sama란' },
              { link: withBase('/ko/docs/overview/other-similar-projects'), text: '비슷한 다른 프로젝트들' },
            ],
            text: '개요',
          },
          {
            icon: 'lucide:book-open',
            items: [
              {
                items: [
                  { link: withBase('/ko/docs/manual/tamagotchi/'), text: '데스크톱 버전' },
                  { link: withBase('/ko/docs/manual/web/'), text: '웹 버전' },
                ],
                text: '빠른 시작',
              },
              { link: withBase('/ko/docs/manual/tamagotchi/setup-and-use/'), text: '설치와 사용' },
              {
                items: [
                  { link: withBase('/ko/docs/manual/config/'), text: '설정 가이드' },
                  { link: withBase('/ko/docs/manual/config/common'), text: '공통 설정' },
                  { collapsed: true, items: [
                    { link: withBase('/ko/docs/manual/config/llm'), text: '채팅 모델' },
                    { link: withBase('/ko/docs/manual/config/audio'), text: '오디오 입출력' },
                    { link: withBase('/ko/docs/manual/config/vision'), text: '비전' },
                    { link: withBase('/ko/docs/manual/config/web-search'), text: '웹 검색' },
                  ], text: '기능 설정' },
                  { collapsed: true, items: [
                    { collapsed: true, items: [
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/official'), text: 'AIRI 공식 제공자' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/aihubmix'), text: 'AIHubMix' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/amazon-bedrock'), text: 'Amazon Bedrock' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/anthropic'), text: 'Anthropic' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/atlascloud'), text: 'Atlas Cloud' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/azure-ai-foundry'), text: 'Azure AI Foundry' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/azure-openai'), text: 'Azure OpenAI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/byteplus'), text: 'BytePlus' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/byteplus-coding-plan'), text: 'BytePlus Coding Plan' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/cerebras'), text: 'Cerebras' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/comet-api'), text: 'Comet API' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/xai'), text: 'xAI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/cloudflare-workers-ai'), text: 'Cloudflare Workers AI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/lm-studio'), text: 'LM Studio (로컬 모델)' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/openpaths'), text: 'OpenPaths' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/ollama'), text: 'Ollama' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/deepseek'), text: 'DeepSeek' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/openai'), text: 'OpenAI & 호환 API' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/302ai'), text: '302.AI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/fireworks'), text: 'Fireworks.ai' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/featherless'), text: 'Featherless AI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/groq'), text: 'Groq' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/minimax'), text: 'MiniMax' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/minimax-global'), text: 'MiniMax Global' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/mistral'), text: 'Mistral' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/modelscope'), text: 'ModelScope' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/moonshot'), text: 'Moonshot AI' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/nvidia'), text: 'NVIDIA NIM' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/n1n'), text: 'n1n' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/novita'), text: 'Novita' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/perplexity'), text: 'Perplexity' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/together'), text: 'Together.ai' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/zhipu'), text: 'Z.ai' },
                      { link: withBase('/ko/docs/manual/config/providers/consciousness/volcengine-coding-plan'), text: 'Volcengine Coding Plan' },
                    ], text: '채팅' },
                    { collapsed: true, items: [
                      { link: withBase('/ko/docs/manual/config/providers/speech/official'), text: '공식 음성 합성 제공자' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/alibaba-cloud-model-studio'), text: 'Alibaba Cloud Model Studio' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/browser-local'), text: '브라우저 (로컬)' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/comet-api'), text: 'Comet API' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/deepgram'), text: 'Deepgram' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/desktop-local'), text: '데스크톱 (로컬)' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/elevenlabs'), text: 'ElevenLabs' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/index-tts'), text: 'Bilibili / IndexTTS' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/kokoro'), text: 'Kokoro TTS (로컬)' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/azure-speech'), text: 'Microsoft Azure Speech' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/minimax'), text: 'MiniMax Speech (사용 불가)' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/openai'), text: 'OpenAI & 호환 API' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/player2'), text: 'Player2' },
                      { link: withBase('/ko/docs/manual/config/providers/speech/volcengine'), text: 'Volcano Engine' },
                    ], text: '음성 합성' },
                    { collapsed: true, items: [
                      { link: withBase('/ko/docs/manual/config/providers/transcription/official'), text: '공식 전사 제공자' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/aliyun'), text: 'Aliyun NLS' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/browser-local'), text: '브라우저 (로컬)' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/web-speech-api'), text: '브라우저 Web Speech API' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/comet-api'), text: 'Comet API' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/desktop-local'), text: '데스크톱 (로컬)' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/ko/docs/manual/config/providers/transcription/openai'), text: 'OpenAI & 호환 API' },
                    ], text: '전사' },
                    { collapsed: true, items: [
                      { link: withBase('/ko/docs/manual/config/providers/artistry/comfyui'), text: 'ComfyUI (로컬 워크플로)' },
                      { link: withBase('/ko/docs/manual/config/providers/artistry/nanobanana'), text: 'Nano Banana' },
                      { link: withBase('/ko/docs/manual/config/providers/artistry/replicate'), text: 'Replicate' },
                    ], text: 'Artistry' },
                  ], text: '서비스 제공자' },
                ],
                text: '설정',
              },
            ],
            link: withBase('/ko/docs/manual/'),
            text: '사용 설명서',
          },
          {
            icon: 'lucide:plug',
            items: [
              {
                items: [
                  { link: withBase('/ko/docs/integrations/minecraft'), text: 'Minecraft 에이전트' },
                  { link: withBase('/ko/docs/integrations/factorio'), text: 'Factorio' },
                ],
                text: '게임',
              },
              {
                items: [
                  { link: withBase('/ko/docs/integrations/satori'), text: 'Satori 봇' },
                  { link: withBase('/ko/docs/integrations/telegram'), text: 'Telegram 봇' },
                  { link: withBase('/ko/docs/integrations/discord'), text: 'Discord 봇' },
                  { link: withBase('/ko/docs/integrations/x'), text: 'X / Twitter (사용 불가)' },
                ],
                text: '메시징 플랫폼',
              },
            ],
            text: '연동 서비스',
          },
          {
            icon: 'lucide:code-2',
            items: [
              {
                items: [
                  { link: withBase('/ko/docs/contributing/'), text: '개발 환경 설정과 사전 준비' },
                  { link: withBase('/ko/docs/contributing/tamagotchi'), text: '데스크톱 앱' },
                  { link: withBase('/ko/docs/contributing/webui'), text: '웹 앱' },
                  { link: withBase('/ko/docs/contributing/docs'), text: '문서 사이트' },
                ],
                text: '기여하기',
              },
              {
                items: [
                  { link: withBase('/ko/docs/contributing/desktop-developer-tools'), text: '개발자 도구' },
                ],
                text: '데스크톱 디버깅',
              },
              {
                items: [
                  { link: withBase('/ko/docs/contributing/design-guidelines/'), text: '소개' },
                  { link: withBase('/ko/docs/contributing/design-guidelines/resources'), text: '아티스트 & 개발자 (참고 자료)' },
                  { link: withBase('/ko/docs/contributing/design-guidelines/tools'), text: '도구' },
                ],
                text: '디자인 가이드라인',
              },
            ],
            text: '개발자 가이드',
          },
          {
            icon: 'lucide:calendar-days',
            items: [
              { link: withBase('/ko/docs/chronicles/version-v0.1.0/'), text: '첫 공개 v0.1.0' },
              { link: withBase('/ko/docs/chronicles/version-v0.0.1/'), text: '그 이전 이야기 v0.0.1' },
            ],
            text: '연대기',
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],

        sidebarMenuLabel: '메뉴',
      },
    },
    'root': {
      label: 'English',
      lang: 'en',
      themeConfig: {
        darkModeSwitchLabel: 'Appearance',
        docFooter: {
          next: 'Next page',
          prev: 'Previous page',
        },
        editLink: {
          pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
          text: 'Edit this page on GitHub',
        },
        homepage: {
          buttons: [
            {
              link: webLive,
              primary: true,
              target: '_self',
              text: 'Try Live',
            },
            {
              link: withBase('/en/docs/overview/versions'),
              text: 'Download',
            },
            {
              link: withBase('/en/docs/overview/'),
              text: 'Get Started',
            },
          ],
        },
        langMenuLabel: 'Change language',
        lastUpdated: {
          text: 'Last updated',
        },
        logo: withBase('/favicon.svg'),
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { link: withBase('/en/docs/overview/'), text: 'Docs' },
          { link: withBase('/en/blog/'), text: 'Blog' },
          {
            items: [
              { link: releases, text: 'Release Notes ' },
            ],
            text: `v${version}`,
          },
          {
            items: [
              { link: withBase('/en/about/privacy'), text: 'Privacy Policy' },
              { link: withBase('/en/about/terms'), text: 'Terms of Use' },
            ],
            text: 'About',
          },
        ],
        outline: {
          label: 'On this page',
          level: 'deep',
        },
        returnToTopLabel: 'Return to top',

        sidebar: [
          {
            icon: 'lucide:rocket',
            items: [
              { link: withBase('/en/docs/overview/'), text: 'Introduction' },
              { link: withBase('/en/docs/overview/versions'), text: 'Versions & Downloads' },
              { link: withBase('/en/docs/overview/about-ai-vtuber'), text: 'About AI VTuber' },
              { link: withBase('/en/docs/overview/about-neuro-sama'), text: 'About Neuro-sama' },
              { link: withBase('/en/docs/overview/other-similar-projects'), text: 'Other Similar Projects' },
            ],
            text: 'Overview',
          },
          {
            icon: 'lucide:book-open',
            items: [
              {
                items: [
                  { link: withBase('/en/docs/manual/tamagotchi/'), text: 'Desktop ver.' },
                  { link: withBase('/en/docs/manual/web/'), text: 'Web Version' },
                ],
                text: 'Quick Start',
              },
              { link: withBase('/en/docs/manual/tamagotchi/setup-and-use/'), text: 'Setup and Use' },
              {
                items: [
                  { link: withBase('/en/docs/manual/config/'), text: 'Configuration Guide' },
                  { link: withBase('/en/docs/manual/config/common'), text: 'Common Setup' },
                  { collapsed: true, items: [
                    { link: withBase('/en/docs/manual/config/llm'), text: 'Chat Models' },
                    { link: withBase('/en/docs/manual/config/audio'), text: 'Audio Input and Output' },
                    { link: withBase('/en/docs/manual/config/vision'), text: 'Vision' },
                    { link: withBase('/en/docs/manual/config/web-search'), text: 'Web Search' },
                  ], text: 'Feature Configuration' },
                  { collapsed: true, items: [
                    { collapsed: true, items: [
                      { link: withBase('/en/docs/manual/config/providers/consciousness/official'), text: 'AIRI Official Provider' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/aihubmix'), text: 'AIHubMix' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/amazon-bedrock'), text: 'Amazon Bedrock' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/anthropic'), text: 'Anthropic' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/atlascloud'), text: 'Atlas Cloud' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/azure-ai-foundry'), text: 'Azure AI Foundry' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/azure-openai'), text: 'Azure OpenAI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/byteplus'), text: 'BytePlus' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/byteplus-coding-plan'), text: 'BytePlus Coding Plan' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/cerebras'), text: 'Cerebras' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/comet-api'), text: 'Comet API' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/xai'), text: 'xAI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/cloudflare-workers-ai'), text: 'Cloudflare Workers AI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/lm-studio'), text: 'LM Studio (Local Model)' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/openpaths'), text: 'OpenPaths' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/ollama'), text: 'Ollama' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/deepseek'), text: 'DeepSeek' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/openai'), text: 'OpenAI & Compatible APIs' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/302ai'), text: '302.AI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/fireworks'), text: 'Fireworks.ai' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/featherless'), text: 'Featherless AI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/groq'), text: 'Groq' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/minimax'), text: 'MiniMax' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/minimax-global'), text: 'MiniMax Global' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/mistral'), text: 'Mistral' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/modelscope'), text: 'ModelScope' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/moonshot'), text: 'Moonshot AI' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/nvidia'), text: 'NVIDIA NIM' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/n1n'), text: 'n1n' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/novita'), text: 'Novita' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/perplexity'), text: 'Perplexity' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/together'), text: 'Together.ai' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/zhipu'), text: 'Z.ai' },
                      { link: withBase('/en/docs/manual/config/providers/consciousness/volcengine-coding-plan'), text: 'Volcengine Coding Plan' },
                    ], text: 'Chat' },
                    { collapsed: true, items: [
                      { link: withBase('/en/docs/manual/config/providers/speech/official'), text: 'Official Speech Provider' },
                      { link: withBase('/en/docs/manual/config/providers/speech/alibaba-cloud-model-studio'), text: 'Alibaba Cloud Model Studio' },
                      { link: withBase('/en/docs/manual/config/providers/speech/browser-local'), text: 'Browser (Local)' },
                      { link: withBase('/en/docs/manual/config/providers/speech/comet-api'), text: 'Comet API' },
                      { link: withBase('/en/docs/manual/config/providers/speech/deepgram'), text: 'Deepgram' },
                      { link: withBase('/en/docs/manual/config/providers/speech/desktop-local'), text: 'Desktop (Local)' },
                      { link: withBase('/en/docs/manual/config/providers/speech/elevenlabs'), text: 'ElevenLabs' },
                      { link: withBase('/en/docs/manual/config/providers/speech/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/en/docs/manual/config/providers/speech/index-tts'), text: 'Bilibili / IndexTTS' },
                      { link: withBase('/en/docs/manual/config/providers/speech/kokoro'), text: 'Kokoro TTS (Local)' },
                      { link: withBase('/en/docs/manual/config/providers/speech/azure-speech'), text: 'Microsoft Azure Speech' },
                      { link: withBase('/en/docs/manual/config/providers/speech/minimax'), text: 'MiniMax Speech (Unavailable)' },
                      { link: withBase('/en/docs/manual/config/providers/speech/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/en/docs/manual/config/providers/speech/openai'), text: 'OpenAI & Compatible APIs' },
                      { link: withBase('/en/docs/manual/config/providers/speech/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/en/docs/manual/config/providers/speech/player2'), text: 'Player2' },
                      { link: withBase('/en/docs/manual/config/providers/speech/volcengine'), text: 'Volcano Engine' },
                    ], text: 'Speech' },
                    { collapsed: true, items: [
                      { link: withBase('/en/docs/manual/config/providers/transcription/official'), text: 'Official Transcription Provider' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/aliyun'), text: 'Aliyun NLS' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/browser-local'), text: 'Browser (Local)' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/web-speech-api'), text: 'Browser Web Speech API' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/comet-api'), text: 'Comet API' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/desktop-local'), text: 'Desktop (Local)' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/mimo'), text: 'Xiaomi MiMo' },
                      { link: withBase('/en/docs/manual/config/providers/transcription/openai'), text: 'OpenAI & Compatible APIs' },
                    ], text: 'Transcription' },
                    { collapsed: true, items: [
                      { link: withBase('/en/docs/manual/config/providers/artistry/comfyui'), text: 'ComfyUI (Local Workflow)' },
                      { link: withBase('/en/docs/manual/config/providers/artistry/nanobanana'), text: 'Nano Banana' },
                      { link: withBase('/en/docs/manual/config/providers/artistry/replicate'), text: 'Replicate' },
                    ], text: 'Artistry' },
                  ], text: 'Service Providers' },
                ],
                text: 'Configuration',
              },
            ],
            link: withBase('/en/docs/manual/'),
            text: 'Manual',
          },
          {
            icon: 'lucide:plug',
            items: [
              {
                items: [
                  { link: withBase('/en/docs/integrations/minecraft'), text: 'Minecraft Agent' },
                  { link: withBase('/en/docs/integrations/factorio'), text: 'Factorio' },
                ],
                text: 'Games',
              },
              {
                items: [
                  { link: withBase('/en/docs/integrations/satori'), text: 'Satori Bot' },
                  { link: withBase('/en/docs/integrations/telegram'), text: 'Telegram Bot' },
                  { link: withBase('/en/docs/integrations/discord'), text: 'Discord Bot' },
                  { link: withBase('/en/docs/integrations/x'), text: 'X / Twitter (Unavailable)' },
                ],
                text: 'Messaging Platforms',
              },
            ],
            text: 'Integration Services',
          },
          {
            icon: 'lucide:code-2',
            items: [
              {
                items: [
                  { link: withBase('/en/docs/contributing/'), text: 'Development Setup & First Contribution' },
                  { link: withBase('/en/docs/contributing/tamagotchi'), text: 'Desktop App' },
                  { link: withBase('/en/docs/contributing/webui'), text: 'Web App' },
                  { link: withBase('/en/docs/contributing/docs'), text: 'Documentation Site' },
                ],
                text: 'Contributing',
              },
              {
                items: [
                  { link: withBase('/en/docs/contributing/desktop-developer-tools'), text: 'Developer Tools' },
                ],
                text: 'Desktop Debugging',
              },
              {
                items: [
                  { link: withBase('/en/docs/contributing/design-guidelines/'), text: 'Introduction' },
                  { link: withBase('/en/docs/contributing/design-guidelines/resources'), text: 'Artists & Developers (Resources)' },
                  { link: withBase('/en/docs/contributing/design-guidelines/tools'), text: 'Tools' },
                ],
                text: 'Design Guidelines',
              },
            ],
            text: 'Developer Guide',
          },
          {
            icon: 'lucide:calendar-days',
            items: [
              { link: withBase('/en/docs/chronicles/version-v0.1.0/'), text: 'Initial Publish v0.1.0' },
              { link: withBase('/en/docs/chronicles/version-v0.0.1/'), text: 'Before Story v0.0.1' },
            ],
            text: 'Chronicles',
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],

        sidebarMenuLabel: 'Menu',
      },
    },
    'zh-Hans': {
      label: '简体中文',
      lang: 'zh-Hans',
      themeConfig: {
        darkModeSwitchLabel: '外观模式',
        docFooter: {
          next: '下一页',
          prev: '上一页',
        },
        editLink: {
          pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
          text: '在 GitHub 编辑此页',
        },
        homepage: {
          buttons: [
            {
              link: webLive,
              primary: true,
              target: '_self',
              text: '网页版',
            },
            {
              link: withBase('/zh-Hans/docs/overview/versions'),
              text: '下载',
            },
            {
              link: withBase('/zh-Hans/docs/overview/'),
              text: '使用教程',
            },
          ],
        },
        langMenuLabel: '切换语言',
        lastUpdated: {
          text: '最后更新',
        },
        logo: withBase('/favicon.svg'),
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { link: withBase('/zh-Hans/docs/overview/'), text: '文档' },
          { link: withBase('/zh-Hans/blog/'), text: '博客 / 开发日志' },
          {
            items: [
              { link: releases, text: '发布说明 ' },
            ],
            text: `v${version}`,
          },
          {
            items: [
              { link: withBase('/zh-Hans/about/privacy'), text: '隐私政策' },
              { link: withBase('/zh-Hans/about/terms'), text: '使用条款' },
            ],
            text: '关于',
          },
        ],
        outline: {
          label: '本页内容',
          level: 'deep',
        },
        returnToTopLabel: '返回顶部',

        sidebar: [
          {
            icon: 'lucide:rocket',
            items: [
              { link: withBase('/zh-Hans/docs/overview/'), text: '这是什么项目？' },
              { link: withBase('/zh-Hans/docs/overview/versions'), text: '版本与下载' },
              { link: withBase('/zh-Hans/docs/overview/about-ai-vtuber'), text: '有关 AI VTuber' },
              { link: withBase('/zh-Hans/docs/overview/about-neuro-sama'), text: '有关 Neuro-sama' },
              { link: withBase('/zh-Hans/docs/overview/other-similar-projects'), text: '其他类似项目' },
              {
                collapsed: true,
                items: [
                  { link: withBase('/zh-Hans/docs/chronicles/version-v0.1.0/'), text: '首次公开 v0.1.0' },
                  { link: withBase('/zh-Hans/docs/chronicles/version-v0.0.1/'), text: '先前的故事 v0.0.1' },
                ],
                text: '编年史',
              },
            ],
            text: '概览',
          },
          {
            icon: 'lucide:book-open',
            items: [
              {
                items: [
                  { link: withBase('/zh-Hans/docs/manual/tamagotchi/'), text: '桌面版' },
                  { link: withBase('/zh-Hans/docs/manual/web/'), text: '网页版' },
                ],
                text: '快速开始',
              },
              {
                link: withBase('/zh-Hans/docs/manual/tamagotchi/setup-and-use/'),
                text: '安装与使用',
              },
              {
                items: [
                  { link: withBase('/zh-Hans/docs/manual/config/'), text: '配置指南' },
                  { link: withBase('/zh-Hans/docs/manual/config/common'), text: '通用说明' },
                  { collapsed: true, items: [
                    { link: withBase('/zh-Hans/docs/manual/config/llm'), text: '聊天模型' },
                    { link: withBase('/zh-Hans/docs/manual/config/audio'), text: '语音输入与输出' },
                    { link: withBase('/zh-Hans/docs/manual/config/vision'), text: '视觉理解' },
                    { link: withBase('/zh-Hans/docs/manual/config/web-search'), text: '网络搜索' },
                  ], text: '功能配置' },
                  { collapsed: true, items: [
                    { collapsed: true, items: [
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/official'), text: 'AIRI 官方提供商' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/aihubmix'), text: 'AIHubMix' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/amazon-bedrock'), text: 'Amazon Bedrock' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/anthropic'), text: 'Anthropic' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/atlascloud'), text: 'Atlas Cloud' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/azure-ai-foundry'), text: 'Azure AI Foundry' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/azure-openai'), text: 'Azure OpenAI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/byteplus'), text: 'BytePlus' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/byteplus-coding-plan'), text: 'BytePlus Coding Plan' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/cerebras'), text: 'Cerebras' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/comet-api'), text: 'CometAPI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/xai'), text: 'xAI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/cloudflare-workers-ai'), text: 'Cloudflare Workers AI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/lm-studio'), text: 'LM Studio（本地模型）' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/openpaths'), text: 'OpenPaths' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/ollama'), text: 'Ollama' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/deepseek'), text: '深度求索 DeepSeek' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/openai'), text: 'OpenAI 与兼容 API' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/302ai'), text: '302.ai' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/fireworks'), text: 'Fireworks AI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/featherless'), text: 'Featherless.ai' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/groq'), text: 'Groq' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/minimax'), text: 'MiniMax' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/minimax-global'), text: 'MiniMax Global' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/mistral'), text: 'Mistral' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/mimo'), text: '小米 MiMo' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/modelscope'), text: 'ModelScope' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/moonshot'), text: '月之暗面' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/nvidia'), text: 'NVIDIA NIM' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/n1n'), text: 'n1n' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/novita'), text: 'Novita' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/perplexity'), text: 'Perplexity' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/together'), text: 'Together.ai' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/zhipu'), text: 'Z.ai' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/consciousness/volcengine-coding-plan'), text: '火山引擎 Coding Plan' },
                    ], text: '聊天服务商' },
                    { collapsed: true, items: [
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/official'), text: 'AIRI 官方语音合成' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/alibaba-cloud-model-studio'), text: '阿里云百炼' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/browser-local'), text: '浏览器本地语音合成' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/comet-api'), text: 'CometAPI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/deepgram'), text: 'Deepgram' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/desktop-local'), text: '桌面端本地语音合成' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/elevenlabs'), text: 'ElevenLabs' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/google-gemini'), text: 'Google Gemini' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/index-tts'), text: 'Index-TTS' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/kokoro'), text: 'Kokoro' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/azure-speech'), text: 'Microsoft Azure Speech' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/minimax'), text: 'MiniMax Speech' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/mimo'), text: '小米 MiMo' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/openai'), text: 'OpenAI 与兼容 API' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/openrouter'), text: 'OpenRouter' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/player2'), text: 'Player2 Speech' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/speech/volcengine'), text: '火山引擎' },
                    ], text: '语音合成（TTS）' },
                    { collapsed: true, items: [
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/official'), text: 'AIRI 官方语音识别' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/aliyun'), text: '阿里云智能语音服务' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/browser-local'), text: '浏览器本地语音识别' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/web-speech-api'), text: '浏览器 Web Speech API' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/comet-api'), text: 'CometAPI' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/desktop-local'), text: '桌面端本地语音识别' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/mimo'), text: '小米 MiMo' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/transcription/openai'), text: 'OpenAI 与兼容 API' },
                    ], text: '语音识别（ASR/STT）' },
                    { collapsed: true, items: [
                      { link: withBase('/zh-Hans/docs/manual/config/providers/artistry/comfyui'), text: 'ComfyUI（本地工作流）' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/artistry/nanobanana'), text: 'Nano Banana' },
                      { link: withBase('/zh-Hans/docs/manual/config/providers/artistry/replicate'), text: 'Replicate' },
                    ], text: '艺术创作服务商' },
                  ], text: '服务商' },
                ],
                text: '配置',
              },
            ],
            link: withBase('/zh-Hans/docs/manual/'),
            text: '用户手册',
          },
          {
            icon: 'lucide:plug',
            items: [
              {
                items: [
                  { link: withBase('/zh-Hans/docs/integrations/minecraft'), text: 'Minecraft 智能体' },
                  { link: withBase('/zh-Hans/docs/integrations/factorio'), text: '异星工厂' },
                ],
                text: '游戏',
              },
              {
                items: [
                  { link: withBase('/zh-Hans/docs/integrations/satori'), text: 'Satori 机器人' },
                  { link: withBase('/zh-Hans/docs/integrations/telegram'), text: 'Telegram 机器人' },
                  { link: withBase('/zh-Hans/docs/integrations/discord'), text: 'Discord 机器人' },
                  { link: withBase('/zh-Hans/docs/integrations/x'), text: 'X / Twitter' },
                ],
                text: '消息平台',
              },
            ],
            text: '集成服务',
          },
          {
            icon: 'lucide:code-2',
            items: [
              {
                items: [
                  { link: withBase('/zh-Hans/docs/contributing/'), text: '开发环境与首次贡献' },
                  { link: withBase('/zh-Hans/docs/contributing/tamagotchi'), text: '桌面端' },
                  { link: withBase('/zh-Hans/docs/contributing/webui'), text: '网页端' },
                  { link: withBase('/zh-Hans/docs/contributing/docs'), text: '文档站' },
                ],
                text: '参与贡献',
              },
              {
                items: [
                  { link: withBase('/zh-Hans/docs/contributing/desktop-developer-tools'), text: '开发者工具' },
                ],
                text: '桌面端调试',
              },
              {
                items: [
                  { link: withBase('/zh-Hans/docs/contributing/design-guidelines/'), text: '介绍' },
                  { link: withBase('/zh-Hans/docs/contributing/design-guidelines/resources'), text: '艺术家与开发者 (参考资源)' },
                  { link: withBase('/zh-Hans/docs/contributing/design-guidelines/tools'), text: '工具' },
                ],
                text: '设计指南',
              },
            ],
            text: '开发者指南',
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],

        sidebarMenuLabel: '菜单',
      },
    },
  },
  markdown: {
    anchor: {
      callback(token) {
        // set tw `group` modifier to heading element
        token.attrSet(
          'class',
          'group relative border-none mb-4 lg:-ml-2 lg:pl-2 lg:pr-2',
        )
      },
      permalink: anchor.permalink.linkInsideHeader({
        class:
          'header-anchor [&_span]:focus:opacity-100 [&_span_>_span]:focus:outline',
        renderAttrs: (slug, state) => {
          // From: https://github.com/vuejs/vitepress/blob/256d742b733bfb62d54c78168b0e867b8eb829c9/src/node/markdown/markdown.ts#L263
          // Find `heading_open` with the id identical to slug
          const idx = state.tokens.findIndex((token) => {
            const attrs = token.attrs
            const id = attrs?.find(attr => attr[0] === 'id')
            return id && slug === id[1]
          })
          // Get the actual heading content
          const title = state.tokens[idx + 1]!.content
          return {
            'aria-label': `Permalink to "${title}"`,
          }
        },
        symbol: `<span class="absolute top-0 -ml-8 hidden items-center border-0 opacity-0 group-hover:opacity-100 focus:opacity-100 lg:flex" style="transition: all 0.2s ease-in-out;">&ZeroWidthSpace;<span class="flex h-6 w-6 items-center justify-center rounded-md outline-2 outline-primary text-green-400 shadow-sm  hover:text-green-700 hover:shadow dark:bg-primary/20 dark:text-primary/80 dark:shadow-none dark:hover:bg-primary/40 dark:hover:text-primary"><svg width="12" height="12" fill="none" aria-hidden="true"><path d="M3.75 1v10M8.25 1v10M1 3.75h10M1 8.25h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></span></span>`,
      }),
    },
    config(md) {
      md.use(tasklist)
      md.use(footnote)
    },
    headers: {
      level: [2, 3, 4, 5, 6],
    },
    theme: {
      dark: 'catppuccin-mocha',
      light: 'catppuccin-latte',
    },
  },
  sitemap: {
    hostname: ogUrl,
  },
  srcDir: 'content',
  themeConfig: {
    editLink: {
      pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
    },
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'x', link: x },
      { icon: 'discord', link: discord },
      { icon: 'github', link: github },
    ],
  },
  title: projectName,
  titleTemplate: projectShortName,
  transformPageData(pageData) {
    if (pageData.frontmatter.sidebar != null)
      return

    // hide sidebar on showcase page
    pageData.frontmatter.sidebar = pageData.frontmatter.layout !== 'showcase'
  },
  vite: {
    css: {
      postcss: {
        plugins: [
          postcssIsolateStyles({ includeFiles: [/vp-doc\.css/] }),
        ],
      },
    },
    plugins: [
      // Thanks https://github.com/intlify/vue-i18n/issues/1205#issuecomment-2707075660
      i18n({ compositionOnly: true, fullInstall: true, runtimeOnly: true, ssr: true }),
      unocss(),
      yaml(),
      frontmatterAssets(),
    ],
    resolve: {
      alias: {
        '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
        '@proj-airi/stage-ui/components': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'components')),
      },
    },
  },
})
