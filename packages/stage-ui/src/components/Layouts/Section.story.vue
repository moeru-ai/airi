<script setup lang="ts">
import Section from './Section.vue'
</script>

<template>
  <Story
    title="Section"
    group="common"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Basic Section"
    >
      <Section title="Basic Section" icon="i-solar:settings-line-duotone">
        <div>This is the content of a basic section</div>
      </Section>
    </Variant>

    <Variant
      id="collapsed"
      title="Initially Collapsed"
    >
      <Section title="Collapsed Section" icon="i-solar:folder-line-duotone" :expand="false">
        <div>This content is initially hidden</div>
      </Section>
    </Variant>

    <Variant
      id="with-custom-class"
      title="With Custom Inner Class"
    >
      <Section title="Custom Inner Class" icon="i-solar:star-line-duotone" inner-class="bg-neutral-50 dark:bg-neutral-900 rounded-md">
        <div>This section has a custom inner class applied</div>
      </Section>
    </Variant>

    <Variant
      id="with-complex-content"
      title="With Complex Content"
    >
      <Section title="Complex Content" icon="i-solar:document-line-duotone">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <div i-solar:info-circle-line-duotone />
            <span>Important information</span>
          </div>
          <div class="border border-neutral-200 rounded-md p-3 dark:border-neutral-700">
            <p>This is a section with more complex nested content</p>
          </div>
        </div>
      </Section>
    </Variant>

    <Variant
      id="multiple-sections"
      title="Multiple Sections"
    >
      <div class="flex flex-col gap-4">
        <Section title="First Section" icon="i-solar:user-line-duotone">
          <div>Content for the first section</div>
        </Section>
        <Section title="Second Section" icon="i-solar:chart-line-duotone">
          <div>Content for the second section</div>
        </Section>
        <Section title="Third Section" icon="i-solar:bell-line-duotone" :expand="false">
          <div>Content for the third section (initially collapsed)</div>
        </Section>
      </div>
    </Variant>
  </Story>
</template>
