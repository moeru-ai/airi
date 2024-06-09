export function useCount() {
  const count = useState('count', () => Math.round(Math.random() * 20))

  function inc() {
    count.value += 1
  }
  function dec() {
    count.value -= 1
  }

  return {
    count,
    inc,
    dec,
  }
}
