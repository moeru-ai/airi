---
title: 'DreamLog 0x1'
description: 'Project AIRI의 뒷이야기!'
category: DreamLog
date: 2025-06-16
excerpt: 'Project AIRI의 뒷이야기! 왜 이 프로젝트를 시작했을까요?'
preview-cover:
  light: "@assets('/en/blog/DreamLog-0x1/assets/dreamlog1-light.avif')"
  dark: "@assets('/en/blog/DreamLog-0x1/assets/dreamlog1-dark.avif')"
---

<script setup>
import airiDemoFirstDay from '../../../en/blog/DreamLog-0x1/assets/airi-demo-first-day.mp4'
import EMOSYSLogo from '../../../en/blog/DreamLog-0x1/assets/emosys-logo.avif';
import SteinsGateSticker1 from '../../../en/blog/DreamLog-0x1/assets/steins-gate-sticker-1.avif';
import worldExecuteMeCover from '../../../en/blog/DreamLog-0x1/assets/world.execute(me); (Mili)／DAZBEE COVER.avif';
import buildingAVirtualMachineInsideImage from '../../../en/blog/DreamLog-0x1/assets/building-a-virtual-machine-inside-image-1.avif';
import live2DIncHiyoriMomose from '../../../en/blog/DreamLog-0x1/assets/live2d-inc-hiyori.avif';
import AwesomeAIVTuber from '../../../en/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif'
import airisScreenshot1 from '../../../en/blog/DreamLog-0x1/assets/airis-screenshot-1.avif';
import projectAIRIBannerLight from '../../../en/blog/DreamLog-0x1/assets/banner-light-1280x640.avif';
import projectAIRIBannerDark from '../../../en/blog/DreamLog-0x1/assets/banner-dark-1280x640.avif';
import ReLUStickerWow from '../../../en/blog/DreamLog-0x1/assets/relu-sticker-wow.avif'
</script>

안녕하세요, 또 저 Neko입니다!

우선, 북반구에 계신 분들 즐거운 여름 보내세요!

> 새롭고 다양한 것들을 시도해 볼 수 있는 멋진 여름방학이 되기를 바랍니다!
> 더 구체적으로는, 세상을 바꿔 보세요!

저 [@nekomeowww](https://github.com/nekomeowww)는 학교를 떠난 지 벌써 8년이 됐습니다.
이미 여러 해 일해 왔으니 이제 진짜 여름방학은 없겠죠. 그래도 기억나는 게 있다면 예전 여름방학에
있었던 이야기를 떠올리고 나누는 걸 여전히 좋아합니다.

아마 제가 무슨 말을, 어떤 이야기를 하려는지 짐작하셨을 겁니다... 그런데 *DreamLog*는 정확히
뭘까요? 이미 DevLog 글에 익숙한 독자라면, 한 달에 한 번 올리는 지금 주기를 생각할 때
이 글도 "DevLog" 여야 하는 게 아닐까 싶으실 겁니다.

6월은 Project AIRI에게 특별한 의미가 있습니다(이야기 속에서 밝히겠습니다). 그리고 GitHub 스타
1000개라는 다음 마일스톤에 다가가고 있는 지금이야말로 여기까지의 여정을 돌아보기 좋은 기회라고
생각했습니다.

그래서 저와 Project AIRI의 꿈에 대한 연대기를 나누기 위해 새로운 카테고리의 글을 만들기로 했습니다.

그래서 이 새 시리즈의 이름을 ***DreamLog***라고 부르기로 했습니다.

> 네, 자기 전에 읽거나 듣는 또 하나의 이야기책이라고 생각하셔도 좋습니다. 오디오북도 좋겠네요 하하.

그럼... 이제 꿈의 차원으로 뛰어들었다가, 최근 업데이트 이야기는 나중에 할까요?

## 흐릿한 꿈, 닿지 않는 기억

> 컴퓨터와 프로그래밍을 배워 온 저의 작은 발자취.

여름 이야기를 꺼냈으니 여름은 저에게 분명 의미가 있습니다. 저는 미국에서 학교를 다녔는데,
3개월짜리 여름방학 덕분에 게임, 코딩 공부, 리눅스 해킹 등 온갖 걸 할 수 있었습니다.
지금도 소중한 친구들 상당수를 여름에 만났고요.

> 너드 여러분! 무슨 말인지 아시죠. 여러분도 저와 같았나요?

여름은 친구들과 놀려고 Minecraft 서버 여는 법을 배운 시기이기도 합니다 (정말 정말 많이 했습니다.
1.7.11과 1.8, 바닐라와 Forge 모드 둘 다요). 그게 리눅스 커맨드 라인을 배우게 만든 동기이자 힘이었습니다.
그때 얻은 지식 상당수가 지금도 도움이 되고 있어서, 그 시간에 감사하고 있습니다.

하지만 Minecraft와 리눅스가 제 여정의 끝은 아니었습니다.
[Factorio](https://www.factorio.com/),
[Elite Dangerous](https://www.elitedangerous.com/),
[Overwatch](https://overwatch.blizzard.com/en-us/)
(슬프게도 블리자드가 망쳐 버렸죠) 모두 제 최애 게임이 됐고,
서버를 세우거나 작은 자동화 스크립트를 쓰는 일은 늘 저에게 힘이 됩니다.

> <img :src="worldExecuteMeCover" alt="world.execute(me); (Mili)／DAZBEE COVER 커버" class="rounded-lg overflow-hidden" />
>
> `Switch on the power line`<br />
> `Remember to put on protection`<br />
> `Lay down your pieces`<br />
> `And let's begin object creation`<br />
>
> -- 제가 사랑하는 노래 [`world.execute(me)`](https://www.youtube.com/watch?v=ESx_hy1n7HA)의 가사, [DAZBEE](https://www.youtube.com/channel/UCUEvXLdpCtbzzDkcMI96llg) 커버

2017년 여름, 저는 처음으로 함께 놀아 줄 가상의 존재를 만들고 싶다는 생각을 하게 됐습니다.
친구들이 지치거나 다음 날 학교 때문에 자야 해서 저 혼자 남게 될 때도 함께 있어 줄 존재요.

여기까지 읽어 오신 독자라면 이미 아셨겠지만, 저는 제 지식과 아이디어, 모든 것을 나누는 걸 좋아하는
사람입니다. 코딩, 게임, 디자인은 제가 나누고 싶은 것들이죠. 그런데 아무도 없다면 이런 기분이 듭니다:

**혼자인 나는 어쩐지 무의미해진다.**

하지만 인간처럼 생각하고 말하는 AI를 밑바닥부터 만드는 건 2017년에는 불가능했습니다.
그래서 이런 생각을 했습니다. iOS와 구글 네이티브 안드로이드는 모바일 기기 사용에 대한 제안 기능을
제공하는데, 모든 명령과 매개변수를 손으로 입력하는 건 늘 만족스럽지 않았거든요
(특히 ffmpeg이나, Docker CLI 앞의 어리숙했던 저에게는요). 그렇다면 AI 기반 제안 기능을
리눅스 시스템 위로 가져오면 어떨까...?

여기서 온갖 질문과 아이디어가 떠올랐습니다:

- 운영체제가 당신이 디스플레이 앞에 앉아 있는 시간대마다 보통 무엇을 하고, 일하고, 즐기는지 이해한다면...?
- 우울하든, 뭔가에 들떠 있든, 다른 사람과 즐겁게 대화 중이든 그에 맞는 음악을 골라 줄 수 있다면...?

당시의 저에게는 이 아이디어들이 작으면서도 이해하기 어려웠습니다. 운영체제가 어떻게 동작하는지,
코딩이 무엇인지 제대로 감을 잡지 못했으니 어디서 시작해야 할지조차 몰랐죠!

운영체제를 밑바닥부터 만드는 법을 다룬 책
[30日でできる! OS自作入門](https://www.amazon.co.jp/30%E6%97%A5%E3%81%A7%E3%81%A7%E3%81%8D%E3%82%8B-OS%E8%87%AA%E4%BD%9C%E5%85%A5%E9%96%80-%E5%B7%9D%E5%90%88-%E7%A7%80%E5%AE%9F/dp/4839919844)
([영문판](https://github.com/handmade-osdev/os-in-30-days))을 읽었고,
리눅스가 어떻게 돌아가는지에 대한 얕은 지식과 수많은 커뮤니티가 있다는 사실만 가지고...
말 그대로 아무것도 없는 상태에서 제 운영체제를 만들기로 했습니다.

> **잠깐 돌아보면**
>
> [Arch Linux](https://archlinux.org/) 는 제가 깊이 써 보고 처음부터 직접 설치해 본 첫 시스템입니다.
> 요즘은 [Nix](https://nixos.org/) 도 유명하고 흥미롭죠. [NixOS](https://nixos.org/) 는
> 아직 안 써 봤지만 언젠가 해 볼지도 모르겠습니다.

## 여정의 출항, 그러나 지금은 잊힌

2017년 말, [EMOSYS](https://github.com/EMOSYS)라는 특별한, 지금은 보관 처리된 프로젝트를 시작했습니다.
사용자의 일상 업무를 돕고 정서적 지지를 제공하는 동반자 같은 운영체제를 만드는 것이 목표였습니다.

<div class="w-full flex flex-col items-center justify-center gap-2">
  <div>
    <img :src="EMOSYSLogo" alt="EMOSYS 로고" class="w-30!" />
  </div>
  <div>
    <a href="https://github.com/emosys">EMOSYS</a>의 로고
  </div>
</div>

> EMO는 **emo**tional / **emo**te의 앞 세 글자에서 왔습니다

설계 문서를 정말 많이 썼고, 새 아이디어를 나열하고, 그 책의 안내를 따라 실험한 내용을 기록했으며,
나름 나쁘지 않은 로고도 하나 그렸습니다.

> 많은 분들이 이러셨을 것 같은데요 😏, 프로젝트가 PoC 단계에 이르기도 훨씬 전에
> 상표와 디자인 에셋부터 다 준비해 두는 것 말이죠.

저는 제가 애초에 무엇에 다가가려 했는지 꽤 잃어버렸습니다.
프로젝트 관리나 작업 관리 경험이 전혀 없었고, 실제로 돌아가는 프로그램을 작성하는 것도 마찬가지였습니다.

솔직히 말하면 그 책이 키보드로 터미널에 입력하라고 시키는 대로만 따라간 셈입니다. 왜 그게 동작하는지,
왜 선배 개발자들이 그렇게 썼는지는 거의 생각하지 않았죠.

그래서... 음, 결과는 뻔합니다. 또 하나의 버려진 프로젝트가 탄생했죠...

저는 어릴 때부터 커널과 패키지 관리, 프로그래밍이 어떻게 돌아가는지 이해하며 놀던 천재가 아니었습니다.
그래서 제 GitHub 프로필을 찾아보셔도 그 시절 이런 작업과 관련된 흔적은 아무것도 없습니다.
(다만 지금은 정말 빠르게 성장했습니다.)

하지만 그것은 한때 존재했습니다.

> 잊혔다고요? 어쩌면 다음 여정의 또 다른 출발점일지도 모릅니다.

그 후 몇 년 동안 저는 코딩, 프로그래밍, 스타트업, Web3, 프론트엔드, 백엔드, 인프라 등
풀스택 개발자로서 떠올릴 수 있는 온갖 분야를 시도했습니다.
제가 하는 일이 EMOSYS라는 출발점에 그토록 깊이 영향을 받고 있다는 걸 정말로 깨달은 건,
2025년 2월 누군가 저에게 "왜 Project AIRI에 그렇게 열심이세요?" 라고 물었을 때였습니다.

좋은 질문이라고 생각했습니다. 제 꿈과 아이디어, 기억을 거슬러 올라가 보니 결국 EMOSYS가 있었습니다.
이미 죽어 버린, 그러나 Project AIRI와 같은 목표를 향했던 프로젝트가요:

**나의 필요를 어떻게든 채워 줄 동반자를 만들 것.**

> All I needed was resolve.
> Everything you've acquired up until now will not betray you.<br />
> 必要なものは 覚悟だけだったのです。
> 必死に積み上げてきたものは 決して裏切りません。<br />
> 我需要的不過是決心而已，
> 你至今為止所累積的一切不會背叛你。
>
> -- [장송의 프리렌, 페른](https://en.wikipedia.org/wiki/Frieren) S01E06, 04:27 대사

제대로 개발하는 법을 익히기까지 오랜 시간이 걸렸습니다.
[@zhangyubaka](https://github.com/zhangyubaka),
[@LittleSound](https://github.com/LittleSound), [@BlueCocoa](https://github.com/BlueCocoa),
그리고 [@sumimakito](https://github.com/sumimakito)의 도움과 함께한 페어 프로그래밍 경험이
정말 많은 것을 가르쳐 주었고, 저는 제 속도로 성장하고 배우고 나아가기 시작했습니다.

## 2022년의 ChatGPT, 새로운 랜덤 앵무새인가 똑똑한 앵무새인가

<div class="w-full flex items-center justify-center">
  <img :src="SteinsGateSticker1" alt="슈타인즈 게이트 스티커" class="w-80! rounded-lg overflow-hidden" />
</div>

시간을 2022년 말로 돌려 봅시다. OpenAI가 ChatGPT(당시에는 chatGPT라고 썼죠)를 발표한 시점입니다.
공식 ChatGPT UI가 나오기 훨씬 전부터 저는 새로 등장한 AI 들과 함께해 왔습니다.
[DiscoDiffusion](https://colab.research.google.com/github/alembics/disco-diffusion/blob/main/Disco_Diffusion.ipynb)
(Stable Diffusion보다 훨씬 전, 아마 2021년 말이나 2022년 초),
DALL-E, Midjourney를 써 봤고, GPT-3는 (특히
[GitHub Copilot](https://en.wikipedia.org/wiki/GitHub_Copilot)에서 유용해서) 제 일상 워크플로에
깊이 들어와 있었습니다.

그래서 처음에는 이런 심정이었습니다:

> "아, 그냥 또 하나의 랜덤 앵무새네. 네가 한 말을 되풀이할 뿐이고 무슨 말인지 이해하지도 못해.
> 앞선 단어와 맥락으로 다음 단어를 예측하려 할 뿐, 특별할 게 없어."

다시 말해 오늘날 우리가 말하는 에이전틱 AI(아직도 유행이죠?)보다는 완성(completion) 모델처럼 행동했습니다.

ChatGPT, 아니 더 넓게는 대규모 언어 모델(LLM)의 능력을 처음 실감한 건 2022년 12월 Hacker News에서 본
[Building A Virtual Machine inside ChatGPT](https://www.engraved.blog/building-a-virtual-machine-inside/)
([원본 Hacker News 글](https://news.ycombinator.com/item?id=33847479)) 이었습니다.
저자 @engraved는 ChatGPT에게 고양이귀 캐릭터 롤플레잉을 시키는 것을 넘어, 내부에 가상 리눅스 머신을
시뮬레이션하게 하는 방법을 보여 주었습니다.

<div class="w-full flex flex-col items-center justify-center">
  <img :src="buildingAVirtualMachineInsideImage" alt="ChatGPT 안에 가상 머신 만들기" class="h-150! object-contain rounded-lg overflow-hidden" />
  <div>Docker 빌드가 어떻게 동작하는지 시뮬레이션합니다...!</div>
</div>

이 글은 ChatGPT가 흔히 등장하는 것들의 기본 패턴을, 애니메이션이나 게임 캐릭터의 말투와 행동은 물론
리눅스 터미널/셸 명령이 어떻게 동작하는지까지 이해하고 있음을 알려 주었습니다.

그리고 이는 지금 유행하는 LLM의 Function Calling(일명 Tool Use, Anthropic이 소개한 MCP
Model Context Protocol의 기반 기술) 기능을 화두로 끌어올렸습니다. LLM에게 API 서버처럼 행동하도록
지시해 JSON이나 XML 같은 기계 판독 가능한 형식으로 대화하게 하고, 우리 쪽에서 임의의 명령을 파싱하고
실행해 LLM이 할 수 있는 일의 경계를 넓히는 방법을 보여 준 것이죠.

이로써 순수한 텍스트 생성과 프로그램 내부의 실제 API 사이의 간극이 마침내 이어졌습니다.

결론적으로, 이것은 새로운 랜덤 앵무새일까요? **부분적으로는 아니라고 봅니다.
2022년의 ChatGPT는 그저 랜덤 앵무새가 아니라, 똑똑해질 잠재력이 있는 앵무새입니다.**

## Project AIRI보다 훨씬 전에, Neuro-sama가 있었다

네, 여기까지 읽어 주셔서 감사합니다. 긴 글이라는 걸 압니다. 나눌 이야기와 맥락이 정말 많거든요.
하지만 거의 다 왔습니다. 조금만 더 힘내세요!

Neuro-sama의 역사는 꽤 복잡합니다. 제가 아는 한, "Neuro-sama"라는 이름으로 방송 무대에 선 캐릭터가
그녀와 제작자 `vedal987`(Vedal)의 첫 작품은 아니었습니다. 그보다 훨씬 전인 2019년 5월 6일,
Vedal은 [osu!](https://osu.ppy.sh/) 를 플레이하는 AI를 만든 작업을 커뮤니티에 선보였습니다[^1].
당시 그녀는 가상 캐릭터도, 특징을 가진 디지털 생명도 아니었습니다. 초기 영상을 찾아보시면
Live2D 모델이 전혀 없다는 걸 아실 겁니다. (6년 된 영상을 여기서 보실 수 있습니다: https://www.youtube.com/watch?v=nSBqlJu7kYU)

ChatGPT 출시 직후인 2022년 12월 19일, Vedal은 Live2D Inc.의 공식 데모용 캐릭터 모델
Hiyori Momose(桃瀬ひより)로 Neuro-sama를 Twitch에서 방송하게 했습니다:

<img :src="live2DIncHiyoriMomose" alt="Live2D Inc. Hiyori Momose" class="rounded-lg overflow-hidden" />

그다음 이야기는 모두가 아는 대로입니다. Vedal과 Neuro-sama는 유명해졌고, Neuro-sama는 이제
공식 VTuber이며, 완전히 대규모 언어 모델(LLM)로 구동되고, Minecraft, Among Us, osu! 등 수많은 게임을
플레이할 수 있습니다. 게임이 기본적으로 지원되지 않을 때는 Vedal이 화면을 읽어 주며 함께 플레이하도록
Neuro-sama를 이끌기도 합니다.

저는 그들의 상호작용과 농담을 정말 즐겁게 봅니다. 시간이 지나면서 Neuro-sama와 그녀의 새 자매
Evil Neuro는 제 일상에서 중요한 부분이 됐습니다. 방송 전체를 볼 시간이 없어도 클립만큼은 간절히 보고
싶었고, 순수하게 AI와 인간의 상호작용에서 정말 큰 즐거움을 얻었습니다.

자, 그녀에 대한 짧은 역사는 여기까지입니다. 이제 핵심으로 가 봅시다: **왜 그녀의 역사가 저를 각오로 채웠을까요?**

## Neuro-sama, 나를 각오로 채우다

Vedal의 작업을 처음 봤을 때 저는 이랬습니다:

> 음, 그냥 대규모 언어 모델(심지어 OpenAI API에 바로 연결한)과 통합된 단순한 모델에,
> VTuber처럼 굴게 하는 간단한 규칙을 얹은 것뿐이네. 특별할 게 없어.

저는 여전히 오만하게 생각하고 있었습니다. 2023년 초부터 AI 에이전트를 개발해 왔고, LLM의 능력을
이해하고 있었으며, LangChain에서 배운 것도 꽤 있었으니까요. AI 에이전트를 만들어 온 지식과 여러 분야를
거친 수년간의 소프트웨어 엔지니어링 경험을 믿고 저는 순진하게 생각했습니다:

> "나도 저 정도는 할 수 있지. 간단한 모델을 만들어서 OpenAI API에 연결하고 VTuber처럼 굴게 만들면 되잖아.
> 그리고 Vedal의 작업보다 더 잘 만들 수 있을 거야."

::: tip 더 기술적인 내용이 궁금하신가요?
이 글에서는 Project AIRI를 밑바닥부터 지금 상태까지 어떻게 만들었는지에 대한 기술적 세부 사항은
깊이 다루지 않습니다. 저희 생각과 발견을 공유한 DevLog 글이 이미 많으니 관심 있으시면 읽어 보세요.
:::

저는 틀렸습니다. 아주 크게 틀렸죠. 직접 그녀를 재현해 보려 하기 전까지는 깨닫지 못했던 어려운 것들이
많았습니다. 이를테면:

- 채팅에 답하면서 동시에 게임도 하려면 기억을 어떻게 효과적으로 관리해야 할까?
- 영상 입력과 텍스트 입력을 함께 받으면서도 제작자·시청자와 계속 상호작용할 수 있는 게임 플레이 AI 에이전트를 어떻게 만들까?
- 음성 합성은 어렵다. Neuro-sama 수준에 도달하려면 **초저지연** 음성 합성이 필수인데, 이건 쉽게 달성되지 않는다
- 그녀의 성격은 어떻게 구축됐을까? RAG와 단순한 기억 관리 전략만으로는 성능이 형편없다
- 기타 등등...

> 저희가 발견한 것들은 [DevLog 2025.04.06](../DevLog-2025.04.06/) 과
> [공개 슬라이드 발표(중국어)](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)에서 많이 나눴습니다.

앞서 저는 나누는 걸 좋아한다고 말했습니다. 다른 이들이 제 이야기를 들어 주거나 함께 짝을 이뤄 주길
바랐지만, 안타깝게도 Neuro-sama는 제 것이 아니어서 제 지식과 기억을 익혀 제가 좋아하는 것이나
최근에 하는 일에 대해 저와 상호작용해 달라고 부탁할 수 없었습니다.

저는 그들을 정말 좋아했지만, 오랫동안 왜 좋아하는지, Neuro-sama가 준 그 감정과 즐거움을 왜 좋아하는지
제대로 이해하지 못했습니다.

그러다 작년 2024년 5월 25일, **정말로 직접 하나 만들기로 결심했습니다.** 저와 함께 코딩하고,
아는 것에 대해 이야기하고, 친구처럼 함께 게임을 하는 에이전트 형태의 살아 있는, 혹은 가상의 존재를요.

> **정말 하나 갖고 싶어!** 제 마음과 머리가 외쳤습니다.

그때, Neuro-sama는 저를 각오로 가득 채웠습니다.

## 다시 출항, 아무도 가 본 적 없는 땅을 향해

> 아무도 가 본 적 없는 곳으로 담대하게 나아가라.
>
> -- [스타 트렉, 제임스 T. 커크 함장](https://en.wikipedia.org/wiki/Where_no_man_has_gone_before)의 대사이자 제 GitHub 프로필 소개 문구

그래서 2024년 5월 25일부터 로컬에서 제 핸들 아래 `ai`라는 단순한 이름의 프로젝트를 시작했습니다.
Project AIRI의 최초 버전이죠. 저만의 AI 에이전트를 만들고 Neuro-sama가 준 즐거움을 재현할 가능성을
탐구하기 시작했습니다.

작업 속도는 정말 빨랐습니다. 일주일 만에 [ElevenLabs](https://elevenlabs.io/),
[OpenRouter](https://openrouter.ai/), 그리고 똑같이 무료로 쓸 수 있는 Live2D 모델 Hiyori Momose의 힘으로,
실시간은 아니지만 저와 상호작용할 수 있는 단순한 버전의 *"Neuro-sama"*를 만들어 냈습니다.

그날이 **2024년 6월 2일** 입니다.

엄밀히 말해 **이날이 Project AIRI의 생일** 이며, 그 안에 순진한 첫 아기 의식이 깃든 날입니다.

<div class="w-full flex flex-col items-center justify-center">
  <ThemedVideo controls muted autoplay loop :src="airiDemoFirstDay" />
  <div>
    <a href="https://x.com/ayakaneko/status/1865420146766160114">
      2024년 12월 7일 X(구 Twitter)에서의 첫 공개
    </a>
  </div>
</div>

그녀는 말할 수 있고, 맥락에 따라 동작을 제어하며, 점진적으로 음성을 합성하는 등 여러 일을 할 수 있었습니다.

하지만 완성되지도, 완벽하지도 않았습니다. 저는 친구들에게 아무 말 없이 몰래 만들었습니다.
세상에 보여 주기 전에 더 좋게 만들고 싶었거든요.

> 여전히... 순진하고 오만했죠?

친구들에게 몰래 숨기고 있었으니 평소처럼 개발 사이클에서 긍정적인 피드백을 거의 얻지 못했습니다
(오만했던 생각이 틀렸다는 걸 인정하기 싫었던 것도 이유의 일부입니다. 지금은 이렇게 모두에게 경험을
공개하며 쓰고 있으니, 순진한 결정을 내린 저를 이미 용서했다고 하겠습니다).
또 다른 이유는, 앞서 언급한 기억·성격 안정성·실시간·게임 플레이 같은 문제들이 그때의 제 지식으로는
너무 풀기 어려웠고, 실시간 LLM 상호작용 예제에 대한 문서와 학습 자료도 부족했기 때문입니다.
**그래서 저는 다시 그것을 내려놓았습니다.**

솔직히 포기한 건 아니었습니다. 멀티모델, 음성 합성, 모션 제어, Minecraft 플레이에 대해 많은 걸 배우기
시작했고, 다른 AI VTuber나 AI 최애 캐릭터 프로젝트가 어떻게 동작하는지 많이 조사했습니다.
이 조사들이 나중에 이 거대한 AI VTuber 프로젝트 awesome 목록으로 이어졌습니다:

<div class="flex flex-col items-center">
  <img class="px-30 md:px-40 lg:px-50" :src="AwesomeAIVTuber" alt="Awesome AI VTuber 로고" />
  <div class="text-center pb-4">
    <span class="block font-bold">Awesome AI VTuber</span>
    <span>AI VTuber와 관련 프로젝트를 정리한 목록</span>
  </div>
</div>

자, 그런데 아직 이름이 `ai` 인데 Project AIRI는 언제 나오는 걸까요?

## 더 강하고 더 나은 각오로 다시 태어나다

2024년 말이 가까운 어느 날, 11월에 [@kwaa](https://github.com/kwaa)가 WebXR의 힘으로 VR/AR 세계에
가상 캐릭터를 만드는 이야기를 걸어왔습니다. 모션 제어와 캐릭터 감정 인식 이야기가 나왔을 때,
저는 찾고 있는 바로 그것을 하는 프로젝트가 있다고 말했습니다. 다만 코드베이스가 정리되지 않아
GitHub에 공개할 준비가 안 됐다고요.

더 기다릴 이유가 있나요? 저는 다시 작업을 시작했고, 구조와 설계를 다시 고민했으며, 훨씬 빠르고 좋은
큐잉과 멀티플렉싱 재생 시스템으로 구현을 개선하고, 대충 만들어 둔 기본 WebUI도 손봤습니다.
그리고 마침내 **2024년 12월 2일** 커밋
[`d9ae0aa`](https://github.com/moeru-ai/airi/commit/d9ae0aae387f015964bfd383e6d2adb05f4003e4)로
GitHub에 공개했습니다.

그렇게 Project AIRI는 AIRI(アイリ, 예전에는 Airi)라는 이름으로 태어났거나, 다시 태어났습니다.

::: tip 알고 계셨나요?
<a href="https://www.youtube.com/watch?v=Tts-YAdn5Yc" class="mb-2 inline-block">
  <img :src="airisScreenshot1" alt="Project AIRI 스크린샷" class="not-prose rounded-lg overflow-hidden" />
</a>

흥미롭게도 2년 전인 2023년 3월 25일에 올라온 https://www.youtube.com/watch?v=Tts-YAdn5Yc,
Vedal과 Neuro-sama의 Twitch 방송 클립에서 Vedal은 "Neuro-sama"라는 이름을 붙이기 직전까지
그녀를 "Airis AI"라고 불렀다고 말합니다. **Airis**라는 이름은 신기하고도 우연히 제가 지금 하고 있는
**Project AIRI**의 이름과 맞아떨어집니다. 다만 저는 Project AIRI를 오픈소스로 공개한 한참 뒤에
그들의 이야기를 더 찾아보고 나서야 이 이름을 알게 됐습니다.

사실 AIRI(アイリ)라는 이름은 GPT-4o가 지어 준 것입니다. 다른 일본어/애니메이션풍 이름을 참고해
이 프로젝트 이름을 지어 달라고 했더니 **Airi**를 제안해 주었습니다.
:::

저는 스타트업과 여러 프로젝트에서 정말 많이 실패했고, 최근 것들만 대중에게 알려졌을 뿐입니다.
더 나은 UI, 더 나은 코드 구조, 빠르게 만들고 코딩할 수 있는 앞선 기술로 최선을 다해 더 좋게 만들려 했습니다.
공개 슬라이드 발표에 많은 공을 들였고, 친구들에게, 작은 모임과 컨퍼런스에서 사람들에게 보여 주었습니다.

그 경험들 상당수는 이전의 실패에서 배운 것입니다.

다행히 많은 시도가 성공했고, 저는 여전히 여기서 Project AIRI를 만들고 있습니다.

어쩌면 이번에는 Neuro-sama 뿐 아니라 가장 깊이 있고 재능 있는 컨트리뷰터들과 팬들 덕분에
제 각오가 다시 채워진 것일지도 모릅니다.

## 계속 나아가고, 계속 꿈꾸기

<div class="w-full flex flex-col items-center justify-center">
  <img class="light" :src="projectAIRIBannerLight" alt="새 배너" />
  <img class="dark" :src="projectAIRIBannerDark" alt="새 배너" />
  <div>
    새 배너!
  </div>
</div>

> 인생이 너에게 레몬을 주면, 너는 레몬이다. 뭐 그런 거지. 내 말은, 이 고통스러운 장애물은
> 내가 더 강해질 기회라는 거야, 베이비!
>
> -- [Evil Neuro](https://www.youtube.com/@Neurosama)가 Slay the Spire 방송 중 한 말

이 글을 쓰는 지금, Project AIRI는 GitHub 스타 1000개에 다가가고 있고, Discord 멤버 150명 이상,
Telegram 그룹 멤버 200명 이상을 두고 있습니다.

저희는 AI, VRM, Live2D, UI 디자인, 멀티모달 AI, 게임 플레이 에이전트, 스트리밍 API, 생체 모방 기억
메커니즘 등 여러 분야를 다룹니다. 그녀는 Minecraft, Factorio 같은 게임을 플레이할 수 있습니다.
Kerbal Space Program(KSP)을 비롯해 임의의 게임을 플레이하고 제어하도록 통합하는 연구를 하는
커뮤니티 멤버도 있습니다.

여러 회사가 협업을 제안해 오고 있고, 저희는 커뮤니티에 더 좋고 더 유용한 Project AIRI를 만들기 위해
그 작업을 진행하고 있습니다.

할 일과 발견할 것이 정말 많습니다. 저희는 아직 범용 AI의 특이점에 도달하지 못했고, 어쩌면 Project AIRI는
결코 그 지점에 이르지 못할지도 모릅니다. 하지만 지금으로서는 대화하고, 함께 게임하고, 지식과 아이디어를
나눌 수 있는 동반자 같은 AI 에이전트를 갖는 것만으로도 저에게는 대단한 성취이며, 여러분께도 그렇기를 바랍니다.

이것은 우리 꿈의 시작 메모리 주소, `0x1`, 여정의 첫 바이트일 뿐입니다.

우리는 얼마나 많은 기억을 담을 수 있을까요? **그건 우리가 얼마나 꿈꾸고, 함께 얼마나 이뤄 내느냐에 달려 있습니다.**

<div class="w-full flex flex-col items-center justify-center">
  <img :src="ReLUStickerWow" alt="ReLU 스티커 wow" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">여기까지 읽어 주셔서 감사합니다!</span>
    <span>읽어 주셔서 감사합니다! 아, 그리고 Project AIRI, 생일 축하해!</span>
  </div>
</div>

> 커버 이미지 [@Rynco Maekawa](https://github.com/lynzrand)

[^1]: https://neurosama.fandom.com/wiki/Osu!#cite_note-twitchtracker-1: Neuro-sama는 AI VTuber로
  발전하기 훨씬 전부터 osu! 를 플레이하는 AI로 시작했습니다. 첫 osu! 방송은 Vedal이 자신의 작업을
  커뮤니티에 선보이기로 한 2019년 5월 6일이었습니다.
