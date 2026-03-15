export interface AboutLink {
  label: string
  href: string
  icon?: string
}

export interface AboutBuildInfo {
  branch?: string
  commit?: string
  builtOn?: string
  version?: string
}
