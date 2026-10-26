<script setup lang="ts">
import { LinkGroup, LinkGroupItem } from '@proj-airi/ui'
</script>

<template>
  <Story title="Link Group" group="misc">
    <Variant id="default" title="Title, icon, and details">
      <div :class="['max-w-xl p-4']">
        <LinkGroup title="Modules" icon="i-solar:layers-bold-duotone">
          <LinkGroupItem href="#" detail="Consciousness">
            Model
          </LinkGroupItem>
          <LinkGroupItem href="#" detail="Hearing › Speech recognition">
            Model
          </LinkGroupItem>
          <LinkGroupItem href="#" detail="Vision">
            Use the vision <b :class="['font-semibold']">model</b> for chat images
          </LinkGroupItem>
          <LinkGroupItem href="#">
            Modules
          </LinkGroupItem>
        </LinkGroup>
      </div>
    </Variant>
    <Variant id="narrow" title="Narrow: the detail cuts first">
      <div :class="['w-80 p-4']">
        <LinkGroup title="Providers" icon="i-solar:box-minimalistic-bold-duotone">
          <LinkGroupItem href="#" detail="Vision › OpenAI-compatible API">
            API protocol
          </LinkGroupItem>
          <LinkGroupItem href="#" detail="Nano Banana">
            Nano Banana (Google AI Studio)
          </LinkGroupItem>
        </LinkGroup>
      </div>
    </Variant>
    <Variant id="plain" title="Without title or icon">
      <div :class="['max-w-xl p-4']">
        <LinkGroup>
          <LinkGroupItem href="#">
            Characters
          </LinkGroupItem>
        </LinkGroup>
      </div>
    </Variant>
  </Story>
</template>
