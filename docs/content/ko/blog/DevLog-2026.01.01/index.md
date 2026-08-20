---
title: DevLog @ 2026.01.01
category: DevLog
date: 2026-01-01
excerpt: |
  AIRI의 iOS 플랫폼 진전과 그 과정에서 만난 문제·해결책, 그리고 LemonNeko가 FlowChat에서 진행한 기억 계층 실험의 성과와 구현 세부 사항을 나눕니다.
preview-cover:
  light: "@assets('/en/blog/DevLog-2026.01.01/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2026.01.01/assets/cover-dark.avif')"
---

::: info AI 번역
이 글은 중국어 원문을 AI로 영어로 옮긴 판을 다시 한국어로 번역한 것입니다. 중국어 원문은 [여기](/zh-Hans/blog/DevLog-2026.01.01/)에서 볼 수 있습니다. 번역에 문제가 있다면 편하게 이슈를 열거나 Pull Request를 보내 주세요.
:::

새해 복 많이 받으세요! AIRI 메인테이너 중 한 명인 [@LemonNekoGH](https://github.com/LemonNekoGH)입니다. 새해 첫 DevLog는 제 차례네요. (B 키를 눌러 웃는 이모티콘 선택) 하하하하하!

<p style="display: flex; justify-content: center;">
    <img src="/en/blog/DevLog-2026.01.01/assets/helldiver-laughing.avif" alt="Helldiver Laughing Emotion" />
</p>

자, 본론으로 갑시다.

## AIRI Pocket

이틀 전, AIRI의 모바일 애플리케이션을 만들기 위해 [Capacitor](https://capacitorjs.com/) 를 도입했습니다 ([#845](https://github.com/moeru-ai/airi/pull/845)). 이를 AIRI Pocket이라고 부릅니다.

iOS를 동작시켰고 알림 기능도 추가했습니다. 즉 그녀가 원한다면 알림을 통해 함께 시간을 보내자고 먼저 말을 걸 수 있습니다.

<p style="display: flex; justify-content: center;">
    <video src="/en/blog/DevLog-2026.01.01/assets/airi-notification-capability.mp4" alt="AIRI Pocket Notification" controls width="230" height="500"></video>
</p>

기본 Capacitor 아이콘은 너무 신경 쓰지 마세요. 나중에 교체할 예정입니다.

영상에서 저는 AIRI를 백그라운드 앱 목록에서 제거했고, 잠시 뒤 AIRI가 알림을 띄웠습니다. 이런 백그라운드 알림은 PWA에서는 구현하기 어렵지만 네이티브 iOS 앱에서는 아주 쉽습니다.

잠깐, 그렇게 순조로웠을까요? 문제가 없었을까요?

### 안전하지 않은 컨텍스트로 인한 기능 제약

당연히 문제가 있었습니다. 첫 번째는 VAD(음성 활성 감지) 컴포넌트였습니다. VAD는 `AudioWorkletNode`에 의존하는데, 이 클래스는 보안 컨텍스트에서만 쓸 수 있습니다. 그런데 Capacitor의 iOS 앱은 개발 중 핫 리로드가 필요해서 개발 환경이 노출한 포트에 직접 접근합니다. 그 결과 브라우저가 이를 안전하지 않은 컨텍스트로 판단해 `AudioWorkletNode` 클래스를 제공하지 않고, VAD가 실패합니다.

패키징 후 프로덕션에서는 보안 컨텍스트가 되지만 개발 중에도 테스트해야 하니 이 문제는 반드시 풀어야 했습니다.

AI와 검색 엔진의 도움으로 `vite-plugin-mkcert` 플러그인을 찾았습니다. 자체 서명 인증서를 생성해 시스템에 설치해 주어 브라우저가 보안 컨텍스트로 인식하게 만들어 줍니다.

그래서 해결됐을까요? 아직입니다. 인증서가 로컬 시스템에는 설치됐지만 iOS에는 설치되지 않아서 WKWebView가 이 인증서를 신뢰하지 않습니다. 그런데 IP가 바뀔 때마다 인증서를 다시 설치해야 한다면 너무 번거롭습니다.

개발 중에는 네이티브 코드를 직접 고쳐서 모든 인증서를 신뢰하게 하면 어떨까요? 실제로 동작합니다:

```swift
import UIKit
import Capacitor
import WebKit

class DevBridgeViewController: CAPBridgeViewController {
    #if DEBUG
    override func viewDidLoad() {
        super.viewDidLoad()
        bridge?.webView?.navigationDelegate = self
    }
    #endif
}

#if DEBUG
extension DevBridgeViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let serverTrust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}
#endif
```

`#if DEBUG` 매크로에 주의하세요. 개발 중에만 활성화하기 위한 것이고 프로덕션에서는 최적화로 제거됩니다. 그러지 않으면 프로덕션에서도 모든 인증서를 허용하게 되는데, 당연히 안전하지 않습니다.

## FlowChat의 기억 계층 실험

LemonNeko가 FlowChat에서 진행한 기억 계층 실험 결과를 보여 드리겠습니다:

<video src="/en/blog/DevLog-2026.01.01/assets/flow-chat-basic-memory.mp4" alt="FlowChat Basic Memory" controls></video>

영상에서 저는 LLM에게 제 이름을 기억하라고 했습니다. 답변을 생성한 뒤 설정 화면에서 기억했다는 것을 확인할 수 있었고, 새 대화를 시작해도 여전히 떠올릴 수 있었습니다.

어떻게 구현했을까요? 현재 구현은 꽤 단순합니다:

1. 기억 테이블을 만듭니다.
2. LLM에게 도구 함수를 제공합니다. 기억해야 할 것이 있다고 판단하면 무엇을 기억할지 서술문으로 요약한 뒤 이 도구 함수를 호출합니다.
3. 매번 새 답변을 요청할 때 모든 기억을 시스템 프롬프트에 이어 붙입니다.

프롬프트를 어떻게 동적으로 이어 붙일까요? [`@velin-dev/vue`](https://github.com/moeru-ai/velin/tree/main/packages/vue) 패키지를 썼습니다. Vue로 프롬프트를 작성할 수 있게 해 주고, Vue가 가진 모든 능력을 그대로 쓸 수 있습니다.

`prompt.velin.md`

```markdown
<script setup lang="ts">
const props = defineProps<{
  memory: string[]
}>()
</script>

<!-- 다른 내용 -->

## Your memories

<ul>
    <li v-for="memory in props.memory">{{ memory }}</li>
</ul>

<!-- 다른 내용 -->
```

위 코드는 markdown 작성도 지원합니다.

혹시 눈치채셨나요? 단계를 소개할 때 "모든 기억을 프롬프트에 이어 붙인다"고 했습니다. 기억이 늘어나면 이 프롬프트는 점점 길어집니다. 어떻게 최적화할까요? 모르겠습니다. 어쩌면 다음 DevLog의 내용이 될지도요.

## 맺으며

자, 올해 첫 DevLog를 제가 ~~대충~~ 썼습니다. 즐겁게 읽으셨기를 바랍니다.

다음 DevLog에서 만나요.

*커버 이미지는 [Google Gemini](https://gemini.google.com/) 로 생성했습니다*
