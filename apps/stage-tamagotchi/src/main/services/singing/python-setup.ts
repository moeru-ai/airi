export type DesktopSingingVenvSetupMode = 'create' | 'recreate' | 'reuse'

// NOTICE: the current singing runtime dependency stack includes `fairseq`,
// `rvc-python`, and transitive native packages that are still significantly
// more reliable on Python 3.10-3.12 than on 3.13+ in packaged desktop setups.
// The setup flow should therefore prefer these interpreter minors and rebuild
// incompatible virtual environments instead of blindly reusing them.
export const DESKTOP_SINGING_SUPPORTED_PYTHON_MINORS = ['3.10', '3.11', '3.12'] as const

export interface DesktopSingingRuntimeImportCheck {
  id: string
  stmt: string
}

export function isDesktopSingingSupportedPythonVersion(version: string | null | undefined): boolean {
  if (!version)
    return false

  const [majorRaw, minorRaw] = version.split('.', 3)
  const major = Number(majorRaw)
  const minor = Number(minorRaw)

  return major === 3 && minor >= 10 && minor <= 12
}

export function resolvePreferredDesktopSingingPythonMinor(
  availableVersions: readonly string[],
): (typeof DESKTOP_SINGING_SUPPORTED_PYTHON_MINORS)[number] | null {
  for (const version of DESKTOP_SINGING_SUPPORTED_PYTHON_MINORS) {
    if (availableVersions.some(candidate => candidate === version || candidate.startsWith(`${version}.`)))
      return version
  }

  return null
}

/**
 * Determines whether the desktop singing runtime can safely reuse an existing
 * virtual environment, or whether a partial `.venv/` needs to be rebuilt.
 */
export function resolveDesktopSingingVenvSetupMode(
  venvDirExists: boolean,
  venvInterpreterExists: boolean,
  venvInterpreterSupported = true,
): DesktopSingingVenvSetupMode {
  if (!venvDirExists)
    return 'create'

  return venvInterpreterExists && venvInterpreterSupported ? 'reuse' : 'recreate'
}

/**
 * Builds a verification script that treats every dependency import failure as a
 * real setup failure, including OSError / RuntimeError from broken native libs.
 */
export function buildDesktopSingingVerifyScriptLines(
  checks: readonly DesktopSingingRuntimeImportCheck[],
): string[] {
  return [
    'import sys',
    'ok = True',
    'results = []',
    '',
    'checks = {',
    ...checks.map(pkg => `    ${JSON.stringify(pkg.id)}: ${JSON.stringify(pkg.stmt)},`),
    '}',
    '',
    'for name, stmt in checks.items():',
    '    try:',
    '        exec(stmt)',
    '        results.append(f"{name}: ok")',
    '    except Exception as e:',
    '        results.append(f"{name}: FAILED ({type(e).__name__}: {e})")',
    '        ok = False',
    '',
    'try:',
    '    import torch',
    '    cuda_info = f"CUDA available: {torch.cuda.is_available()}"',
    '    if torch.cuda.is_available():',
    '        cuda_info += f", device: {torch.cuda.get_device_name(0)}"',
    '    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():',
    '        cuda_info += ", MPS available: True"',
    '    results.append(cuda_info)',
    'except Exception as e:',
    '    results.append(f"torch_runtime: FAILED ({type(e).__name__}: {e})")',
    '    ok = False',
    '',
    'for r in results:',
    '    print(r)',
    '',
    'if ok:',
    '    print("ALL_PACKAGES_OK")',
    'else:',
    '    print("SOME_PACKAGES_MISSING")',
    '    sys.exit(1)',
  ]
}
