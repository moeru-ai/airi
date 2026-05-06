"""Compatibility patches for PyTorch 2.6+ and other library changes.

PyTorch 2.6 changed torch.load default from weights_only=False to True.
Libraries like fairseq, rvc_python, and older model checkpoints rely on
the old behavior. This module patches torch.load to restore compatibility
for our trusted local model files.

Call patch_torch_load() BEFORE importing fairseq or loading any models.
"""

_patched = False


def patch_torch_load() -> None:
    """Monkey-patch torch.load to default weights_only=False for PyTorch 2.6+."""
    global _patched
    if _patched:
        return

    try:
        import torch
    except ImportError:
        return

    major, minor = int(torch.__version__.split(".")[0]), int(torch.__version__.split(".")[1])
    if major < 2 or (major == 2 and minor < 6):
        _patched = True
        return

    _original_load = torch.load

    def _patched_load(*args, **kwargs):
        if "weights_only" not in kwargs:
            kwargs["weights_only"] = False
        return _original_load(*args, **kwargs)

    torch.load = _patched_load
    _patched = True
