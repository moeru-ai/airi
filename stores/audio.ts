import { defineStore } from 'pinia'

export const useAudioContext = defineStore('AudioContext', () => {
  const audioContext = new AudioContext()

  return {
    audioContext,
  }
})
