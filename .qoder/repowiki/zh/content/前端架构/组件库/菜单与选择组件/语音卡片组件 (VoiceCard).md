# 语音卡片组件 (VoiceCard)

<cite>
**Referenced Files in This Document**   
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue)
- [VoiceCard.story.vue](file://packages/stage-ui/src/components/menu/VoiceCard.story.vue)
</cite>

## 目录
1. [简介](#简介)
2. [核心功能](#核心功能)
3. [属性详解](#属性详解)
4. [事件系统](#事件系统)
5. [音频预览功能](#音频预览功能)
6. [语音特征显示](#语音特征显示)
7. [实际使用示例](#实际使用示例)
8. [性能优化建议](#性能优化建议)
9. [结论](#结论)

## 简介

语音卡片组件 (VoiceCard) 是一个专门用于语音模型选择界面的交互式UI组件。该组件为用户提供了一种直观的方式来浏览、预览和选择不同的语音模型。它在语音设置页面中扮演着核心角色，允许用户通过可视化界面探索各种语音选项，包括试听语音样本、查看语音特征以及选择自定义语音名称。

该组件设计精良，具有现代化的视觉效果和流畅的交互体验。它不仅提供了基本的语音选择功能，还集成了音频预览、可视化波形显示和语音特征展示等高级特性，极大地提升了用户体验。语音卡片组件特别适用于需要TTS（文本转语音）功能的应用程序，如虚拟助手、语音合成工具和语音交互系统。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L1-L267)

## 核心功能

语音卡片组件提供了一系列核心功能，使其成为语音选择界面的理想选择。组件的主要功能包括语音选择、音频预览、语音特征显示和自定义语音命名。这些功能共同构成了一个完整的语音选择体验，让用户能够轻松地找到并选择最适合他们需求的语音模型。

组件采用单选模式，用户可以从多个语音选项中选择一个作为当前使用的语音。每个语音卡片都包含一个视觉化的单选按钮，当用户选择某个语音时，卡片的外观会发生变化，以提供清晰的视觉反馈。这种设计遵循了标准的UI/UX原则，确保用户能够直观地理解当前的选择状态。

除了基本的选择功能外，组件还支持语音预览，允许用户在选择前试听语音样本。这对于帮助用户做出决策至关重要，因为语音的音质、语调和情感表达往往难以通过文字描述来准确传达。通过直接试听，用户可以更好地评估语音是否符合他们的期望。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L96-L133)

## 属性详解

语音卡片组件通过一组精心设计的属性来配置其行为和外观。这些属性允许开发者根据具体需求定制组件的功能和显示方式。

### 基础属性
- **name**: 字符串类型，用于标识语音卡片组的名称。这个属性在HTML表单中用于将多个单选按钮关联到同一个组，确保用户只能选择其中一个选项。
- **voice**: 语音对象类型，包含语音的所有相关信息，如ID、名称、描述、预览音频URL、标签（如性别、年龄、口音）和语言支持等。这是组件的核心数据源。

### 可选属性
- **currentlyPlayingId**: 字符串类型，用于跟踪当前正在播放预览音频的语音ID。当某个语音的预览音频正在播放时，该属性会被设置为相应的语音ID，从而触发播放按钮的视觉状态变化。
- **customInputPlaceholder**: 字符串类型，用于设置自定义语音名称输入框的占位符文本。当语音支持自定义名称时，此属性允许开发者提供一个描述性的提示文本。
- **showVisualizer**: 布尔类型，控制是否显示音频可视化波形。当设置为true时，如果音频正在播放，将在卡片底部显示一个动态的音频频谱可视化效果。
- **audioStream**: MediaStream类型，用于传递音频流数据。这个属性与音频可视化功能配合使用，为可视化组件提供实时的音频数据。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L15-L30)

## 事件系统

语音卡片组件通过事件系统与父组件进行通信，实现了松耦合的设计模式。这种设计使得组件可以独立工作，同时又能与应用程序的其他部分无缝集成。

### 主要事件
- **togglePlayback**: 当用户点击播放/暂停按钮时触发。该事件携带被操作的语音对象作为参数，允许父组件处理音频播放逻辑。这是组件与外部音频系统集成的关键接口。

### 模型绑定
组件使用Vue的v-model机制来实现双向数据绑定：
- **v-model:voice-id**: 绑定当前选中的语音ID。当用户选择一个语音时，这个值会自动更新，并且当外部状态改变时，组件的选中状态也会相应更新。
- **v-model:custom-voice-name**: 绑定自定义语音名称。对于支持自定义名称的语音，用户输入的名称会通过这个模型绑定传递给父组件。

这种事件和模型绑定的组合使得语音卡片组件既灵活又易于使用。父组件可以监听事件来执行复杂的业务逻辑（如加载音频文件、更新TTS配置等），同时通过模型绑定轻松获取用户的选择状态。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L85-L96)

## 音频预览功能

音频预览功能是语音卡片组件的核心特性之一，它允许用户在选择语音前试听其声音样本。这个功能通过集成Web Audio API和HTML5音频元素实现，提供了流畅的音频播放体验。

### 预览音频处理
组件通过`getPreviewUrl`函数获取语音的预览音频URL。该函数会检查语音对象中的`previewURL`或`preview_audio_url`字段，确保能够从不同格式的数据源中提取音频URL。这种灵活性使得组件可以兼容多种后端API和数据结构。

### 播放控制
播放功能由`togglePlayback`方法实现，该方法通过emit事件将播放请求传递给父组件。这种设计模式将音频播放的复杂逻辑（如音频流管理、错误处理、跨域问题解决等）从UI组件中分离出来，保持了组件的简洁性和可维护性。

### 音频可视化
当`showVisualizer`属性为true且音频正在播放时，组件会在卡片底部显示一个音频频谱可视化效果。这个可视化效果使用`AudioSpectrum`和`AudioSpectrumVisualizer`组件实现，通过分析音频流的频率数据来生成动态的视觉效果。可视化效果不仅增强了用户体验，还为用户提供了音频播放状态的直观反馈。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L52-L85)
- [VoiceCard.story.vue](file://packages/stage-ui/src/components/menu/VoiceCard.story.vue#L42-L119)

## 语音特征显示

语音卡片组件通过智能地显示语音特征来帮助用户快速了解每个语音的特点。这些特征包括性别、年龄、口音和语言支持等，以标签的形式直观地展示在语音名称下方。

### 特征格式化
`formatVoiceAttributes`函数负责将语音对象中的标签信息转换为可显示的字符串数组。该函数会检查语音的`labels`对象，提取性别、年龄、口音等信息，并将它们组合成一个数组。同时，函数还会处理语言支持信息，将所有支持的语言名称连接成一个字符串。

### 视觉呈现
格式化后的特征以小型标签的形式显示在语音卡片上。当语音被选中时，标签的样式会相应变化，使用主题色来突出显示，增强视觉层次感。这种设计使得用户可以快速扫描和比较不同语音的特征，从而做出更明智的选择。

### 自定义输入
对于支持自定义的语音，组件还提供了一个输入框，允许用户为选中的语音指定自定义名称。这个功能特别适用于需要个性化语音命名的场景，如为虚拟助手选择特定的"声音身份"。

**Section sources**
- [VoiceCard.vue](file://packages/stage-ui/src/components/menu/VoiceCard.vue#L52-L96)

## 实际使用示例

以下是一个在语音设置页面中使用语音卡片组件的完整示例，展示了如何构建一个可预览的语音选择界面。

```vue
<template>
  <div class="voice-settings">
    <h2>选择语音</h2>
    <div class="voice-selection-grid">
      <VoiceCard
        v-for="voice in availableVoices"
        :key="voice.id"
        v-model:voice-id="selectedVoiceId"
        v-model:custom-voice-name="customVoiceName"
        :voice="voice"
        name="voice-selection"
        :currently-playing-id="currentlyPlayingId"
        :audio-stream="audioStream"
        @toggle-playback="handleTogglePlayback"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VoiceCard from '@proj-airi/stage-ui/components/menu/VoiceCard.vue'

// 语音数据
const availableVoices = ref([
  {
    id: 'lNxY9WuCBCZCISASyJ55',
    name: 'Myriam',
    previewURL: 'https://example.com/voices/myriam.mp3',
    customizable: true,
    labels: {
      gender: '女性',
      age: '年轻',
      accent: '美式',
    },
    languages: [
      { name: '英语', code: 'en-US' },
    ],
  },
  {
    id: 'dLhSyo03JRp5WkGpUlz1',
    name: 'Camilla_KM',
    previewURL: 'https://example.com/voices/camilla.mp3',
    customizable: true,
    labels: {
      gender: '女性',
      age: '年轻',
      accent: '美式',
    },
    languages: [
      { name: '英语', code: 'en-US' },
    ],
  }
])

// 状态管理
const selectedVoiceId = ref('')
const customVoiceName = ref('')
const currentlyPlayingId = ref<string>()
const audioStream = ref<MediaStream | null>(null)
const audioElement = ref<HTMLAudioElement>()

// 音频播放控制
function handleTogglePlayback(voice: { id: string }) {
  if (currentlyPlayingId.value === voice.id) {
    stopAudio()
  } else {
    playAudio(voice.id)
  }
}

function playAudio(voiceId: string) {
  // 停止当前播放的音频
  if (audioElement.value && !audioElement.value.paused) {
    stopAudio()
  }

  // 查找选中的语音
  const voice = availableVoices.value.find(v => v.id === voiceId)
  if (!voice || !voice.previewURL) return

  // 创建音频元素
  audioElement.value = new Audio(voice.previewURL)
  audioElement.value.crossOrigin = 'anonymous'

  // 设置音频播放完成后的回调
  audioElement.value.onended = () => {
    currentlyPlayingId.value = undefined
  }

  // 开始播放
  audioElement.value.play()
  currentlyPlayingId.value = voiceId
}

function stopAudio() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value = undefined
  }
  currentlyPlayingId.value = undefined
}
</script>
```

这个示例展示了如何将语音卡片组件集成到一个完整的语音设置界面中。通过v-for指令，我们可以轻松地为每个可用语音创建一个语音卡片。事件处理函数`handleTogglePlayback`负责管理音频播放状态，确保同一时间只有一个语音的预览音频在播放。

**Section sources**
- [VoiceCard.story.vue](file://packages/stage-ui/src/components/menu/VoiceCard.story.vue#L0-L171)

## 性能优化建议

为了确保语音卡片组件在各种场景下都能提供流畅的用户体验，以下是一些性能优化建议：

### 资源预加载
对于包含大量语音选项的界面，建议在用户打开语音选择页面时预加载所有语音的预览音频元数据。这可以通过在组件挂载时发起多个HEAD请求来获取音频文件的大小和时长信息，从而避免用户点击播放按钮时的延迟。

### 音频缓存
实现音频缓存机制，避免重复下载相同的预览音频文件。可以使用浏览器的Cache API或IndexedDB来存储已下载的音频数据。当用户多次试听同一个语音时，可以直接从缓存中加载，显著减少网络请求和加载时间。

### 懒加载
对于包含大量语音选项的长列表，考虑实现虚拟滚动或懒加载技术。只渲染当前可见区域的语音卡片，当用户滚动时动态加载和卸载卡片。这可以大大减少DOM节点数量，提高页面渲染性能。

### 音频上下文管理
合理管理Web Audio API的AudioContext实例。避免为每个语音预览创建新的AudioContext，而是使用单例模式共享一个AudioContext实例。同时，在组件卸载时记得关闭AudioContext，释放系统资源。

### 视觉效果优化
音频可视化效果虽然美观，但可能会消耗较多的CPU资源。建议提供一个设置选项，允许用户在性能模式下关闭可视化效果。此外，可以降低可视化组件的更新频率，或使用Web Workers在后台线程中处理音频分析，避免阻塞主线程。

**Section sources**
- [VoiceCard.story.vue](file://packages/stage-ui/src/components/menu/VoiceCard.story.vue#L42-L119)

## 结论

语音卡片组件是一个功能丰富、设计精良的UI组件，为语音模型选择提供了完整的解决方案。通过集成音频预览、语音特征显示和自定义命名等特性，它极大地提升了用户在选择语音时的体验。

组件的模块化设计和清晰的API使其易于集成到各种应用程序中。无论是简单的语音选择界面还是复杂的TTS配置面板，语音卡片组件都能提供一致且直观的用户体验。通过遵循本文档中的使用示例和性能优化建议，开发者可以充分利用该组件的潜力，为他们的应用程序创建出色的语音交互体验。

随着语音技术的不断发展，语音卡片组件将继续演进，支持更多语音特征、更丰富的可视化效果和更智能的推荐功能，为用户提供更加个性化和沉浸式的语音选择体验。