---
title: DevLog @ 2025.08.26
category: DevLog
date: 2025-08-26
excerpt: |
  `airi-factorio`의 순수 비전 방향에서 이룬 진전을 공유하며, 생각이 증발하기 전에 붙잡아 둡니다.
preview-cover:
# TODO
---

<script setup lang="ts">
import airiFactorioYoloV0PlaygroundVnc from '../../../en/blog/DevLog-2025.08.26/assets/airi-factorio-yolo-v0-playground-vnc.mp4'
import NmsIou from '../../../en/blog/DevLog-2025.08.26/components/nms-iou.vue'
</script>

오랜만입니다, 여러분! AIRI 메인테이너 중 한 명인 [@LemonNeko](https://github.com/LemonNekoGH)입니다. ~~아, 이렇게 시작하는 것도 슬슬 지겹네요. 꼭 LLM 같잖아요.~~

지난 [DevLog](../DevLog-2025.07.18/) 에서는 [Factorio Learning Environment](https://arxiv.org/abs/2503.09617) 논문을 간단히 살펴보고 `airi-factorio`를 어떻게 개선할지 이야기했습니다. 그런데... 오늘 나눌 이야기는 그것이 아니라 순수 비전 방향에서의 진전입니다.

올해 6월, [@nekomeowww](https://github.com/nekomeowww)가 거의 실시간으로 동작하는 [VLM Playground](https://huggingface.co/spaces/moeru-ai/smolvlm-realtime-webgpu-vue) HuggingFace Space를 공개했는데 정말 멋져 보였습니다. 그래서 먼저 간단한 실시간 이미지 인식(당시엔 객체 탐지와 이미지 인식을 헷갈렸습니다)을 시도하고, 어떻게든 AI에게 넘겨 판단하게 한 뒤, 어떤 방식으로든 게임에 동작을 출력하기로 했습니다.

먼저 결과부터 보여 드리겠습니다:

<ThemedVideo :src="airiFactorioYoloV0PlaygroundVnc" controls playsinline />

영상에서 저는 웹 페이지의 VNC 연결로 Factorio를 플레이하고 있고, 오른쪽에는 객체 탐지 결과가 거의 실시간으로 표시됩니다. [HuggingFace Space](https://huggingface.co/spaces/proj-airi/factorio-yolo-v0-playground)에도 배포했으니 편하게 써 보세요.

그럼 이걸 어떻게 구현했을까요?

## Factorio 클라이언트를 Docker에 넣기

AI가 게임 화면을 보게 하려면 Factorio가 창 크기나 위치 같은 것에 영향받지 않는 통제된 환경에서 돌아가야 합니다. 동시에 이 환경이 바로 쓸 수 있는 상태이길 원했기에, Factorio를 Docker에 넣기로 했습니다.

Factorio는 공식 [Docker 이미지](https://hub.docker.com/r/factoriotools/factorio)를 제공하지만 이는 순수 서버용입니다. AI가 화면을 보고 게임을 조작하게 하려면 클라이언트가 필요한데, 기존 Docker 이미지를 찾을 수 없었고 (Factorio 라이선스 계약상 클라이언트를 이런 식으로 배포할 수도 없습니다) 직접 패키징해야 했습니다 (그리고 패키징한 클라이언트 이미지도 배포할 수 없어서 Dockerfile만 공유할 수 있습니다).

그럼 Factorio 클라이언트~~라는 코끼리~~를 Docker~~라는 냉장고~~에 넣으려면 몇 단계가 필요할까요~~?~~

1. Factorio 클라이언트 다운로드: 당연히 주인공이죠.
2. 가상 디스플레이 준비: 그래픽 애플리케이션은 화면을 표시할 디스플레이가 필요합니다.
3. VNC 서비스 준비: 가상 디스플레이의 내용을 읽어 외부 VNC 클라이언트로 화면을 전송하고, 사용자 입력을 게임에 전달할 수 있습니다.

뭔가 빠진 것 같나요? 아, 오디오요? 무슨 오디오요? 없습니다. 지금의 AI는 아직 소리를 듣지 못하니 일단 무시하겠습니다.

### Factorio 클라이언트 다운로드

Factorio 공식 사이트에서 바로 받을 수 있지만 수동 로그인이 필요해서 자동화 워크플로에는 불편합니다. 그래서 다운로드 스크립트 [factorio-dl](https://github.com/moviuro/factorio-dl/) 을 찾았습니다. 사용자 이름, 비밀번호, 받을 버전을 주면 시스템 아키텍처에 맞는 클라이언트를 자동으로 내려받아 주는, 아주 복잡한 셸 스크립트입니다.

### 가상 디스플레이 준비

이 단계는 조금 더 복잡하지만 전체 데스크톱 환경을 설치하는 것만큼은 아닙니다. 이때 그래픽 애플리케이션이 반드시 데스크톱 환경이나 윈도우 매니저를 필요로 하지 않고, 최소한의 X 환경과 디스플레이 서버만 있으면 된다는 것도 배웠습니다.

아주 간단합니다:

```bash
sudo apt install -y xvfb x11-apps mesa-utils
```

여기서:
- `xvfb`는 가상 프레임버퍼이자 X 서버입니다.
- `x11-apps`는 X 관련 도구 모음으로, 설치하면 X 환경도 함께 설치됩니다.
- `mesa-utils`는 Mesa 관련 도구 모음입니다. Mesa는 OpenGL의 소프트웨어 구현이며, OpenGL 애플리케이션을 테스트하고 디버깅하는 데 도움이 되는 도구를 제공합니다.

### VNC 서비스 준비

VNC는 Virtual Network Computing의 약자로, 마치 그 앞에 앉아 있는 것처럼 다른 컴퓨터를 원격으로 제어할 수 있게 해 주는 원격 데스크톱 프로토콜입니다.

```bash
sudo apt install -y x11vnc
```

여기까지 하면 Docker에서 Factorio 클라이언트를 실행하고 VNC로 제어할 수 있습니다.

하지만 아직 부족합니다. 제 목표는 브라우저에서 플레이하면서 실시간으로 객체 탐지 추론을 돌리는 것입니다. 그런데 브라우저는 HTTP 프로토콜만 쓸 수 있으므로, VNC 프로토콜을 HTTP로 변환해 줄 `websockify` 같은 도구가 필요합니다. 또 디버깅 편의를 위해 VNC 화면을 보여 줄 웹 인터페이스도 필요해서 `novnc`도 설치합니다.

```bash
sudo apt install -y websockify novnc
```

좋습니다! 이제 Docker 이미지가 준비됐습니다. 전체 [Dockerfile](https://github.com/moeru-ai/airi-factorio/blob/a6bf243f14cbc0d765ff7ed13389bca33c1fdfa2/docker/Dockerfile)과 [사용 안내](https://github.com/moeru-ai/airi-factorio/tree/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground)는 여기서 볼 수 있습니다.

## 객체 탐지 모델 학습

빠른 검증을 위해 YOLO11n의 사전 학습 모델을 기반으로 저희 객체 탐지 모델을 학습시켰습니다.

### 데이터셋 준비

데이터셋은 이렇게 수집했습니다:

1. [`surface.create_entity`](https://lua-api.factorio.com/latest/classes/LuaSurface.html#create_entity) 함수로 씬의 임의 위치에 기계를 배치하고, 선택 박스 크기와 위치를 함께 얻습니다.
2. [`game.take_screenshot`](https://lua-api.factorio.com/latest/classes/LuaGameScript.html#take_screenshot)으로 다양한 줌 레벨과 조명 조건(낮)에서 스크린샷을 찍습니다.
3. 선택 박스를 바탕으로 어노테이션 데이터를 생성하고 [`helpers.write_file`](https://lua-api.factorio.com/latest/classes/LuaHelpers.html#write_file)로 파일에 저장합니다.

제 수집 스크립트는 [여기](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/packages/factorio-rcon-snippets-for-node/src/factorio_yolo_dataset_collector_v0.ts)에 있습니다. `typescript-to-lua`로 TypeScript를 Lua로 컴파일한 뒤 RCON으로 Factorio에 넘겨 실행합니다.

스크립트에서는 조립기 3종과 컨베이어를 수집했고, 기계마다 이미지 20장씩, 각 이미지는 UI 없이 1280x1280 해상도로 찍었습니다.

아 참, 수집 스크립트를 더 잘 디버깅하려고 [VSCode 플러그인](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/packages/vscode-factorio-rcon-evaluator/README.md)도 만들었습니다. CodeLens로 클릭 한 번에 스크립트를 컴파일하고 실행할 수 있습니다.

이미지와 어노테이션 데이터를 모은 뒤에는 [YOLO 공식 형식](https://docs.ultralytics.com/datasets/detect/)에 맞춰 데이터셋을 정리하고, [Ultralytics Hub](https://www.ultralytics.com/hub)에 업로드해 결과를 확인합니다:

![Ultralytics Hub](/en/blog/DevLog-2025.08.26/assets/factorio-ultralytics-hub-preview.avif)

꽤 괜찮아 보이죠? 학습을 시작해 봅시다!

### 모델 학습

이제 막 시작한 단계라 [Get Started](https://docs.ultralytics.com/tasks/detect/) 에서 이 몇 줄을 그대로 복사했습니다:

```python
from ultralytics import YOLO

model = YOLO("yolo11n.pt")
model.train(data="./dataset/detect.yaml", epochs=100, imgsz=640, device="mps")
model.export(format="onnx")
```

640x640 해상도로 MPS 디바이스를 써서(macOS에서는 MPS 디바이스가 성능이 더 좋습니다) 100 에포크 학습했고, 에포크당 배치는 5개, 대략 70 에포크쯤에서 최적 성능에 도달했으며 ONNX 모델로 내보냈습니다. 학습에는 약 8분이 걸렸고 모델 크기는 약 10MB입니다.

데이터셋, 학습 코드, 내보낸 ONNX 모델은 [여기](https://github.com/moeru-ai/airi-factorio/blob/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground)에서 볼 수 있습니다.

## 추론 수행하기

이제 위 두 부분을 조립할 수 있습니다. 저는 다음을 사용했습니다:

1. `@novnc/novnc`로 브라우저에 VNC 화면을 표시하면서 캔버스 데이터를 뽑아 모델에 먹입니다.
2. `onnxruntime-web`으로 브라우저에서 추론을 수행합니다. WebGPU를 지원해서 GPU 성능을 활용할 수 있습니다.

처음에는 추론이 400ms 정도로 매우 느렸고 UI까지 멈춰 버려 VNC를 쓸 수 없었습니다. 급히 WebWorker 사용법을 익혀 추론과 화면 표시를 분리해 이 문제를 해결했습니다. 그리고 사실 WebGPU가 켜져 있지 않았다는 것도 알게 됐는데, 그래서 속도가 여전히 느렸던 것이죠.

```typescript
ort.InferenceSession.create(model, { executionProviders: ['webgpu', 'wasm'] })
```

WebGPU와 WASM 실행 방식을 모두 허용한다고 명시해야, WebGPU를 쓸 수 없을 때 자동으로 WASM 실행으로 전환됩니다.

WebGPU를 켜자 추론 속도가 약 80ms로 개선됐습니다. 여전히 만족스럽지 않았지만 더 최적화할 방법을 몰랐죠. 그때 Cursor가 이렇게 알려 줬습니다: "픽셀 색상 값을 정규화할 때 계속 255로 나누고 있습니다. `1/255`를 먼저 계산해 두고 그 값을 곱해서 나눗셈을 피하세요."

네? 잠깐, 나눗셈이 곱셈보다 느리다고요? 건너뛴 컴퓨터 과학 수업을 정말 보충해야겠네요.

Cursor의 제안대로 코드를 고치자 추론 속도가 약 20ms로 개선됐습니다. 이제 체감이 꽤 좋습니다.

앞에서 모델 출력을 처리하는 부분은 건너뛰었는데, 이제 살펴봅시다.

### 모델 출력 처리하기

모델은 원소 84,000개짜리 배열과 `dims`가 `[1, 10, 8400]` 인 배열을 출력합니다. 즉 84,000개 원소가 10개씩 묶여 있고, 각 묶음은 바운딩 박스 중심의 x, y 좌표, 박스의 너비와 높이, 그리고 6개 카테고리의 신뢰도 점수를 담고 있으며, 총 8,400개의 결과 묶음이 됩니다.

임계값 0.6으로 신뢰도가 낮은 바운딩 박스를 걸러낸 뒤에도, 겹치는 박스를 제거하기 위해 NMS 방법으로 IOU를 써야 합니다.

IOU와 NMS에 대해서는 [이 글](https://medium.com/@jesse419419/understanding-iou-and-nms-by-a-j-dcebaad60652)을 참고하세요. 간단히 말하면 두 박스의 넓이를 더한 뒤 겹치는 넓이를 빼서 실제 차지하는 넓이를 구하고, 겹치는 넓이를 실제 차지하는 넓이로 나눠 IOU를 얻는 것입니다.

저는 아주 단순한 NMS 구현을 썼습니다. 모든 바운딩 박스를 신뢰도로 정렬한 뒤 높은 것부터 순회하며, IOU가 0.7보다 크면 같은 객체로 보고 걸러냅니다.

```typescript
function nms(boxes: Box[], iouThreshold: number): Box[] {
  // 1. 신뢰도로 걸러낸 뒤 내림차순 정렬
  const candidates = boxes
    .filter(box => box.confidence > 0.6)
    .sort((a, b) => b.confidence - a.confidence)

  const result: Box[] = []

  while (candidates.length > 0) {
    // 2. 신뢰도가 가장 높은 박스를 고른다
    const bestCandidate = candidates.shift()!
    result.push(bestCandidate)

    // 3. 남은 박스들과 비교해 IOU 가 높은 것을 제거한다
    for (let i = candidates.length - 1; i >= 0; i--) {
      // iou() 함수는 글에서 설명한 대로 따로 구현해야 합니다.
      if (iou(bestCandidate, candidates[i]) > iouThreshold) {
        candidates.splice(i, 1)
      }
    }
  }

  return result
}
```

Playground 전체 소스 코드는 [여기](https://github.com/moeru-ai/airi-factorio/tree/ba46a4e47b31187dd064b06314b595b551ed3411/apps/factorio-yolo-v0-playground)에서 볼 수 있습니다.

아래 시각화 컴포넌트에서 라벨을 드래그해 박스 위치를 바꿔 가며 IOU와 NMS 효과를 직접 만져 볼 수도 있습니다:

<div class="flex justify-center">
  <NmsIou />
</div>

### 발견한 문제들

이번 실습을 통해 몇 가지 문제를 발견했습니다:

1. 정사각형이 아닌 이미지를 인식하지 못함: 정사각형이 아닌 이미지를 만나면 모든 결과의 신뢰도가 매우 낮아지거나 심지어 0이 됩니다.
2. 모델이 1티어와 2티어 조립기를 구분하기는 하지만, 상자처럼 네모난 물체도 조립기로 인식합니다.
3. 실제 플레이에서는 기계 텍스처 위에 전력, 현재 레시피, 장착된 모듈 같은 상태 표시가 겹쳐 있어 모델 인식을 방해합니다.

## 맺으며

이것이 이번 달 작업의 결과입니다. 꽤 알찼네요! 도움을 준 [@nekomeowww](https://github.com/nekomeowww), [@dsh0416](https://github.com/dsh0416), [makito](https://github.com/sumimakito)에게 깊이 감사드립니다. 다음으로는 모델 성능을 개선할 방법을 찾고, 어떻게든 AI가 게임을 조작하게 만들어야 합니다.
