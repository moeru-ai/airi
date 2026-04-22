import { ref } from 'vue'

const selectedOption = ref({ id: 'colorful-wave' })
const sampledColor = ref('#ffffff')

export function useBackgroundStore() {
  return {
    selectedOption,
    sampledColor,
  }
}
