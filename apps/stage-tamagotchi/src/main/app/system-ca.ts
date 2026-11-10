import tls from 'node:tls'

/**
 * Makes `fetch` and `https` in the main process trust the certificates of the operating system.
 *
 * Node reads only its bundled Mozilla list. A Home Assistant or a model server behind a private CA
 * that the user trusts in the keychain then fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
 * The system list on macOS holds only the certificates that the user added, so it joins the bundled
 * list instead of replacing it.
 */
export function trustSystemCACertificates() {
  const certificates = new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])
  tls.setDefaultCACertificates([...certificates])
}
