<script setup lang="ts">
import { Alert, Button } from '@proj-airi/ui'
import { ref } from 'vue'

const tones = ['info', 'success', 'warning', 'danger'] as const

const showSuccess = ref(true)
const showInfo = ref(true)
</script>

<template>
  <Story
    title="Alert"
    group="common"
    :layout="{ type: 'single', iframe: true }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="tones" title="Tones">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert v-for="tone in tones" :key="tone" :tone="tone" :title="`Title for ${tone}`">
          Supporting text that explains what happened and what the user can do next.
        </Alert>
      </div>
    </Variant>

    <Variant id="message-only" title="Message only">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert tone="info">
          No API key required. Web Speech API is built into your browser.
        </Alert>
        <Alert tone="success">
          Web search is configured.
        </Alert>
        <Alert tone="warning">
          Downgrade package downloaded from selected channel. Restart will install an older version.
        </Alert>
        <Alert tone="danger">
          Workflow upload failed.
        </Alert>
      </div>
    </Variant>

    <Variant id="actions" title="Actions and loading">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert tone="info" loading title="Validating provider">
          Checking the API key and the model list.
        </Alert>
        <Alert tone="warning">
          Cannot load experimental features.
          <template #actions>
            <Button size="sm">
              Retry
            </Button>
          </template>
        </Alert>
        <Alert tone="danger" title="Validation failed">
          <span :class="['whitespace-pre-wrap break-all']">401 Unauthorized: invalid API key</span>
          <template #actions>
            <Button size="sm" color="red">
              Continue anyway
            </Button>
          </template>
        </Alert>
      </div>
    </Variant>

    <Variant id="multi-line" title="Multi-line">
      <div :class="['flex flex-col gap-3 p-4 max-w-md']">
        <Alert tone="warning">
          Selected channel offers an older build than your current version. Installing this update will downgrade AIRI, and some settings saved by the newer version can be lost.
        </Alert>
        <Alert tone="danger" title="Model load failed">
          The Live2D model references textures that are missing from the archive. Check that the ZIP contains every file listed in model3.json, then import it again.
        </Alert>
      </div>
    </Variant>

    <Variant id="next-actions" title="Next actions">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert tone="warning" title="Downgrade package downloaded">
          Restart will install v0.13.1, which is older than your current version.
          <template #actions>
            <Button size="sm" color="amber" variant="primary">
              Restart and install
            </Button>
            <Button size="sm">
              Switch back to Nightly
            </Button>
          </template>
        </Alert>
        <Alert tone="info" title="No chat provider yet">
          Set up a provider to start talking with AIRI.
          <template #actions>
            <Button size="sm" color="primary" variant="primary">
              Set up provider
            </Button>
          </template>
        </Alert>
        <Alert tone="danger">
          Cannot connect to the server channel.
          <template #actions>
            <Button size="sm">
              Retry
            </Button>
          </template>
        </Alert>
      </div>
    </Variant>

    <Variant id="dismissible" title="Dismissible">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert v-if="showSuccess" tone="success" dismissible @dismiss="showSuccess = false">
          Web search is configured.
        </Alert>
        <Alert v-if="showInfo" tone="info" title="Voice input is in beta" dismissible @dismiss="showInfo = false">
          Recognition quality depends on your microphone and provider.
          <template #actions>
            <Button size="sm">
              Learn more
            </Button>
          </template>
        </Alert>
        <Button v-if="!showSuccess || !showInfo" size="sm" @click="showSuccess = true; showInfo = true">
          Reset
        </Button>
      </div>
    </Variant>

    <Variant id="rich-text" title="Rich text">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert tone="danger" title="ComfyUI blocked the request">
          <p>The browser blocked the request because ComfyUI does not send CORS headers.</p>
          <p>Start ComfyUI with <code>--enable-cors-header</code>, or read the <a href="#">ComfyUI setup guide</a>.</p>
        </Alert>
        <Alert tone="warning" title="Model has 2 warnings">
          <ul>
            <li>Expression count is <strong>low</strong> (2 of 8).</li>
            <li>Texture <code>body.png</code> is larger than 4096 px.</li>
          </ul>
        </Alert>
      </div>
    </Variant>

    <Variant id="translucent-surface" title="On a translucent surface">
      <!-- A floating chat window: a translucent, blurred panel over the desktop. Alerts must keep their own colors here. -->
      <div :class="['p-4 bg-gradient-to-br from-neutral-900 via-sky-950 to-neutral-800']">
        <div :class="['flex flex-col gap-3 rounded-3xl p-4', 'bg-neutral-400/45 backdrop-blur-xl']">
          <Alert v-for="tone in tones" :key="tone" :tone="tone" :title="`Title for ${tone}`">
            Choose and validate a provider in Settings before sending a message.
          </Alert>
          <div :class="['rounded-2xl bg-white p-4 text-neutral-400 dark:bg-neutral-900']">
            Say something...
          </div>
        </div>
      </div>
    </Variant>

    <Variant id="real-cases" title="Real cases">
      <div :class="['flex flex-col gap-3 p-4']">
        <Alert tone="warning" title="AIRI is installed in a protected Windows folder">
          Update install may require a UAC admin prompt.
          <div :class="['mt-1 text-xs font-mono break-all opacity-80']">
            Path: C:\Program Files\AIRI
          </div>
        </Alert>
        <Alert tone="danger" title="MCP server failed to start">
          spawn npx ENOENT
        </Alert>
        <Alert tone="warning" title="Wake word conflict">
          "Hey AIRI" is already used by another character.
        </Alert>
        <Alert tone="danger" title="CORS blocked">
          Start ComfyUI with CORS enabled.
          <div :class="['mt-2 rounded-lg bg-black/5 p-2 text-xs font-mono break-all dark:bg-white/5']">
            python main.py --enable-cors-header
          </div>
        </Alert>
      </div>
    </Variant>
  </Story>
</template>
