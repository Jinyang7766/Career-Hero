# -*- coding: utf-8 -*-
try:
    from app_monolith import app, PORT
except ImportError:
    from backend.app_monolith import app, PORT

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
