"""Model registry: tracks available models and their paths."""

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class ModelInfo:
    """Information about a registered model."""

    name: str
    backend: str
    path: str
    description: Optional[str] = None


# Global model registry (populated at startup)
_registry: Dict[str, ModelInfo] = {}


def register_model(info: ModelInfo) -> None:
    """Register a model in the global registry."""
    _registry[info.name] = info


def get_model(name: str) -> Optional[ModelInfo]:
    """Get a registered model by name."""
    return _registry.get(name)


def list_models(backend: Optional[str] = None) -> list:
    """List all registered models, optionally filtered by backend."""
    models = list(_registry.values())
    if backend:
        models = [m for m in models if m.backend == backend]
    return models
