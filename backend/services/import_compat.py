from __future__ import annotations

from importlib import import_module
from typing import Iterable, Any


def _module_candidates(module_name: str) -> list[str]:
    normalized = str(module_name or "").strip()
    if not normalized:
        raise ValueError("module_name must not be empty")

    if normalized.startswith("backend."):
        base = normalized[len("backend.") :]
        return [normalized, base] if base else [normalized]

    return [normalized, f"backend.{normalized}"]


def import_module_with_backend_fallback(module_name: str):
    last_error: Exception | None = None
    seen: set[str] = set()

    for candidate in _module_candidates(module_name):
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            return import_module(candidate)
        except ImportError as exc:
            last_error = exc

    if last_error is not None:
        raise last_error
    raise ImportError(str(module_name))


def import_attrs(module_name: str, attr_names: Iterable[str]) -> tuple[Any, ...]:
    module = import_module_with_backend_fallback(module_name)
    return tuple(getattr(module, name) for name in attr_names)


def import_attr(module_name: str, attr_name: str) -> Any:
    return import_attrs(module_name, (attr_name,))[0]
