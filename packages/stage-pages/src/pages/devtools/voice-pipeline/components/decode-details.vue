<script setup lang="ts">
import type { ProbeResult, TokenAgreement } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import { joinTokens } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

const props = defineProps<{
  result: ProbeResult
  tokens: readonly TokenAgreement[]
}>()

function agreementLabel(value: number | undefined) {
  return value === undefined ? '-' : value.toFixed(2)
}
</script>

<template>
  <details :class="['text-sm']">
    <summary :class="['cursor-pointer font-medium']">
      Reference tokens
    </summary>
    <div :class="['flex flex-wrap gap-1 pt-2 font-mono text-xs']">
      <span
        v-for="(agreement, index) in props.tokens"
        :key="index"
        :title="`time ${agreement.token.time?.toFixed(2) ?? '-'} s, log p ${agreement.token.logProbability?.toFixed(2) ?? '-'}`"
        :class="['flex flex-col items-center rounded px-1', 'bg-neutral-100 dark:bg-neutral-800']"
      >
        <span>{{ agreement.token.text.replaceAll('▁', '·') }}</span>
        <span :class="['text-neutral-500']">{{ agreementLabel(agreement.byTime) }}</span>
        <span :class="['text-neutral-400']">{{ agreementLabel(agreement.byText) }}</span>
      </span>
    </div>
    <div :class="['pt-1 text-xs text-neutral-500']">
      Second line: agreement by audio time. Third line: agreement by text alignment only.
    </div>
  </details>

  <details :class="['text-sm']">
    <summary :class="['cursor-pointer font-medium']">
      Decodes
    </summary>
    <table :class="['mt-2 w-full text-left text-xs']">
      <thead>
        <tr :class="['text-neutral-500']">
          <th>SNR</th>
          <th>Shift</th>
          <th>Speed</th>
          <th>Text</th>
        </tr>
      </thead>
      <tbody :class="['font-mono']">
        <tr>
          <td colspan="3">
            reference
          </td>
          <td>{{ joinTokens(props.result.reference.tokens.map(token => token.text)) }}</td>
        </tr>
        <tr v-for="(sample, index) in props.result.samples" :key="index">
          <template v-if="sample.perturbation">
            <td>{{ sample.perturbation.snrDb.toFixed(1) }} dB</td>
            <td>{{ sample.perturbation.shiftMs.toFixed(0) }} ms</td>
            <td>{{ sample.perturbation.speed.toFixed(3) }}</td>
          </template>
          <td v-else colspan="3">
            encoder noise
          </td>
          <td>{{ joinTokens(sample.hypothesis.tokens.map(token => token.text)) }}</td>
        </tr>
        <tr v-if="props.result.probe">
          <td colspan="3">
            blank penalty
          </td>
          <td>{{ joinTokens(props.result.probe.tokens.map(token => token.text)) }}</td>
        </tr>
      </tbody>
    </table>
  </details>
</template>
