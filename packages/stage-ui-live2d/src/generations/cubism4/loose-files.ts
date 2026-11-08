/**
 * Recognizes the loose archive entries Cubism 4 fake settings are built from.
 *
 * Loose files carry no manifest, so their extensions are all the heuristic has
 * to go on, and archives in the wild ship `.MOC3`/`.PNG` as readily as the
 * lowercase spellings. Validation and settings construction must agree on the
 * rule, or an archive passes the report and then fails to load.
 *
 * Manifest-referenced paths stay exact: only self-discovered entries match this
 * way. These predicates deliberately pull in no runtime, so validation can run
 * before a Cubism Core is present.
 */
export function isCubism4MocFile(file: string): boolean {
  return file.toLowerCase().endsWith('.moc3')
}

export function isCubism4TextureFile(file: string): boolean {
  return file.toLowerCase().endsWith('.png')
}

export function isCubism4MotionFile(file: string): boolean {
  const path = file.toLowerCase()
  return path.endsWith('.mtn') || path.endsWith('.motion3.json')
}
