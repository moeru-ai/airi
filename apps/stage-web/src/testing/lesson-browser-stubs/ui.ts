import { computed, defineComponent, h } from 'vue'

interface SelectOption {
  label?: string
  value?: string
}

function normalizedValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export const Button = defineComponent({
  name: 'LessonUiButtonStub',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    loading: Boolean,
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      disabled: props.disabled || props.loading,
      type: 'button',
      onClick: (event: MouseEvent) => emit('click', event),
    }, slots.default?.())
  },
})

export const Callout = defineComponent({
  name: 'LessonUiCalloutStub',
  inheritAttrs: false,
  props: {
    label: {
      type: String,
      default: '',
    },
  },
  setup(props, { attrs, slots }) {
    return () => h('div', {
      ...attrs,
      'data-testid': attrs['data-testid'] || 'lesson-ui-callout-stub',
    }, [
      props.label ? h('div', { 'data-testid': 'lesson-ui-callout-label' }, props.label) : null,
      slots.default?.(),
    ])
  },
})

export const FieldSelect = defineComponent({
  name: 'LessonUiFieldSelectStub',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
    label: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    options: {
      type: Array as () => SelectOption[],
      default: () => [],
    },
    placeholder: {
      type: String,
      default: '',
    },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    const value = computed(() => normalizedValue(props.modelValue))

    return () => h('label', {
      ...attrs,
      'data-testid': attrs['data-testid'] || 'lesson-ui-field-select-stub',
    }, [
      props.label ? h('span', props.label) : null,
      props.description ? h('span', props.description) : null,
      h('select', {
        disabled: props.disabled,
        value: value.value,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
      }, [
        props.placeholder
          ? h('option', {
              value: '',
              disabled: true,
            }, props.placeholder)
          : null,
        ...props.options.map(option => h('option', {
          key: normalizedValue(option.value),
          value: normalizedValue(option.value),
        }, option.label || normalizedValue(option.value))),
      ]),
    ])
  },
})

export const Input = defineComponent({
  name: 'LessonUiInputStub',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    const value = computed(() => normalizedValue(props.modelValue))

    return () => h('input', {
      ...attrs,
      value: value.value,
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
    })
  },
})

export const Progress = defineComponent({
  name: 'LessonUiProgressStub',
  inheritAttrs: false,
  props: {
    progress: {
      type: Number,
      default: 0,
    },
  },
  setup(props, { attrs }) {
    return () => h('div', {
      ...attrs,
      'role': 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(props.progress),
      'data-progress': String(props.progress),
    })
  },
})

export const SelectTab = defineComponent({
  name: 'LessonUiSelectTabStub',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
    options: {
      type: Array as () => SelectOption[],
      default: () => [],
    },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    const value = computed(() => normalizedValue(props.modelValue))

    return () => h('div', {
      ...attrs,
      'role': 'radiogroup',
      'data-testid': attrs['data-testid'] || 'lesson-ui-select-tab-stub',
    }, props.options.map((option) => {
      const optionValue = normalizedValue(option.value)
      return h('button', {
        'key': optionValue,
        'type': 'button',
        'role': 'radio',
        'aria-label': option.label || optionValue,
        'aria-checked': String(value.value === optionValue),
        'disabled': props.disabled,
        'onClick': () => emit('update:modelValue', optionValue),
      }, option.label || optionValue)
    }))
  },
})

export const BasicTextarea = defineComponent({
  name: 'LessonUiBasicTextareaStub',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
  },
  emits: ['update:modelValue', 'submit', 'compositionstart', 'compositionend'],
  setup(props, { attrs, emit }) {
    const value = computed(() => normalizedValue(props.modelValue))

    return () => h('textarea', {
      ...attrs,
      value: value.value,
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      onCompositionstart: (event: CompositionEvent) => emit('compositionstart', event),
      onCompositionend: (event: CompositionEvent) => emit('compositionend', event),
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          emit('submit')
        }
      },
    })
  },
})
