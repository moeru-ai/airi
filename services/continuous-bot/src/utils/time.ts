const timerMap = new Map()

export function setClockInterval(func: (...args: any[]) => any, interval: number) {
  let start: number
  let tick: number
  let clockTimer: ReturnType<typeof setTimeout>
  const timerId = Math.floor(Math.random() * 1e10)

  const recurFunc = () => {
    func()
    const realExecuteTime = new Date().getTime()
    if (!start) {
      start = realExecuteTime
    }

    tick = tick || start
    const diff = realExecuteTime - tick
    tick += interval

    // Since setTimeout is not accurate, we need to adjust the interval
    clockTimer = setTimeout(recurFunc, interval - diff)
    timerMap.set(timerId, clockTimer)
  }

  recurFunc()
  return timerId
}
