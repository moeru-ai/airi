export function flatten<T extends Record<string, any>, U extends keyof T>(items: T[], key: U): T[] {
  return items.reduce((acc: any[], item: T) => {
    acc.push(item)
    if (item[key])
      acc.push(...flatten(item[key], key as any))
    return acc
  }, [])
}
