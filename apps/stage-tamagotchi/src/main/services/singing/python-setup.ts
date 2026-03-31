export type DesktopSingingVenvSetupMode = 'create' | 'recreate' | 'reuse'

export interface DesktopSingingRuntimeImportCheck {
  id: string
  stmt: string
}

/**
 * Determines whether the desktop singing runtime can safely reuse an existing
 * virtual environment, or whether a partial `.venv/` needs to be rebuilt.
 */
export function resolveDesktopSingingVenvSetupMode(
  venvDirExists: boolean,
  venvInterpreterExists: boolean,
): DesktopSingingVenvSetupMode {
  if (!venvDirExists)
    return 'create'

  return venvInterpreterExists ? 'reuse' : 'recreate'
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
