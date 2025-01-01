export function isPlatformDesktop() {
  return import.meta.env.MODE === 'desktop'
}
