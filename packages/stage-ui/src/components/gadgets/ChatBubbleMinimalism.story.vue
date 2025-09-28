<script setup lang="ts">
import { sleep } from '@moeru/std'
import { onMounted, ref } from 'vue'

import ChatBubbleMinimalism from './ChatBubbleMinimalism.vue'

function createStream(text: string) {
  let doneFunc = () => {}

  return {
    untilDone: () => {
      return new Promise<void>((resolve) => {
        doneFunc = () => {
          resolve()
        }
      })
    },
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(text)
        let index = 0
        const interval = setInterval(() => {
          if (index < bytes.length) {
            controller.enqueue(bytes.subarray(index, index + 1))
            index++
          }
          else {
            clearInterval(interval)
            doneFunc()
            controller.close()
          }
        }, 10 * Math.random())
      },
    }),
  }
}

const stream = ref<ReadableStream>()

const senderTextStream = ref<ReadableStream>()
const showSenderTextStream = ref(false)

const recipientTextStream = ref<ReadableStream>()
const recipientLoading = ref(false)
const showRecipientTextStream = ref(false)

onMounted(async () => {
  // https://sooxin.github.io/Chinese-Lorem-Ipsum/
  stream.value = createStream(`阜？态辞犹愿捷欣悲诚、三忙振佩珊澄鲁概爷骗炭耘肢干题蜘育饼契疫浦硫。盖零。

尝陷悬埃笔宋酵钨庭专橄？`).stream

  {
    // https://generator.lorem-ipsum.info/_japanese2
    const textStreamRes = createStream(`もリソソンまら他差根課阿模舳素擢等れるのねはて素擢んり留等はさたによしみろ等離離樹派津夜きたせやれありゃ遊絵めゆたそそ屋御ユユソカフあゅえ樹れろは、こにとしむあまさももけ氏ひれしゅ雲差屋へ。`)

    senderTextStream.value = textStreamRes.stream
    showSenderTextStream.value = true
    await textStreamRes.untilDone()
  }

  showRecipientTextStream.value = true
  recipientLoading.value = true
  await sleep(2000)
  recipientLoading.value = false

  {
    // https://generator.lorem-ipsum.info/_japanese2
    const textStreamRes = createStream(`無個阿巣やにせ手派しらいほね以、留絵離列知魔ヤツソセョノおやてすょほ離目津知舳露津んっそくり都阿いョシトヒツヤえょいね瀬保無区ッヤャか保津くるヌッ絵鵜んっらほ。露露、んセトフヘトターろ派津めん区等名ゅな魔絵手名もよろれ鵜以ゃゅ、ヤスカ離手つみ目根雲うちゆらめ区夜日保模舳露ラナョュあせ。

のこふえいれ絵差譜阿擢ゅょろひへちりえ、いろへね個日模手野いん留個夜御リヘヨヤトヘゅちハヤケュニオセ以個野つへぬけけゃとやなゃゆりるか目巣絵。あいっ区以差離きんそぬに絵根ょつみ離離派派津。むゆく。

サュウ御譜譜ャレニシくるむくと阿毛のも遊氏魔やこもほ無野、みえ阿ヒュソきみてゅさりよ毛手無鵜留ょ、ょむけ樹テチ模以個等み留目夜にそ露ねへはすまねかやう夜尾手魔おあ保素遊せ留雲根いぬこ素屋譜雲氏みむゅまろいんぬ屋模無二まほめやいへれふたおいね、そたにけそね名樹ち個お、れ派個絵にち以無模留ヌロナニャ、にのほまふ列やき二模擢うしょすて知根と手阿やゅけ。`)

    recipientTextStream.value = textStreamRes.stream
    await textStreamRes.untilDone()
  }
})
</script>

<template>
  <Story
    title="Chat Bubble (Minimalism)"
    group="gadgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <ChatBubbleMinimalism :text="stream" font-xiaolai w-100 />
    </Variant>

    <Variant
      id="loading"
      title="Loading"
    >
      <ChatBubbleMinimalism font-xiaolai w-100 side="left" :loading="true" />
    </Variant>

    <Variant
      id="chat"
      title="Chat"
    >
      <div bg="neutral-50 dark:neutral-900" font-m-plus-rounded w-120 flex flex-col gap-2 overflow-y-scroll rounded-xl p-4>
        <ChatBubbleMinimalism v-if="showSenderTextStream" :text="senderTextStream" side="left" w-100 self-start />
        <ChatBubbleMinimalism v-if="showRecipientTextStream" :text="recipientTextStream" w-100 self-end :loading="recipientLoading" />
      </div>
    </Variant>
  </Story>
</template>
