# -*- coding: utf-8 -*-
import os
import sys
import types


def _ensure_backend_package_alias():
    """
    In some deployments (e.g. Railway with backend/ as service root), files are
    flattened under /app and there is no top-level `backend` package directory.
    A large part of the codebase uses fallback imports like `backend.services...`.
    Register a runtime alias so those imports still resolve.
    """
    if 'backend' in sys.modules:
        return
    pkg = types.ModuleType('backend')
    pkg.__path__ = [os.path.dirname(__file__)]
    sys.modules['backend'] = pkg


_ensure_backend_package_alias()

try:
    from app_monolith import app, PORT
except ImportError:
    from backend.app_monolith import app, PORT

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
