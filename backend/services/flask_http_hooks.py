# -*- coding: utf-8 -*-
from flask import jsonify
from flask_cors import CORS


def configure_flask_http_hooks(
    app,
    anti_bot_guard,
    extract_client_ip,
    auto_deletion_sweep_enabled: bool,
    run_expired_deletion_sweep,
):
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": "*",
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "X-Client-Trace-Id"]
            }
        },
        supports_credentials=False
    )

    @app.before_request
    def handle_options_request():
        allowed, body, status, extra_headers = anti_bot_guard.check(
            path=request.path,
            method=request.method,
            headers=request.headers,
            remote_addr=extract_client_ip(),
        )
        if not allowed:
            response = jsonify(body or {'error': '请求被拒绝'})
            response.status_code = status
            for k, v in (extra_headers or {}).items():
                response.headers[k] = v
            return response

        if auto_deletion_sweep_enabled and request.path.startswith('/api/'):
            if not request.path.startswith('/api/internal/sweep-expired-deletions'):
                try:
                    run_expired_deletion_sweep(force=False, limit=200)
                except Exception:
                    pass

    @app.after_request
    def apply_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With,X-Client-Trace-Id'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        return response


# Local import to avoid circular import at module load time.
from flask import request  # noqa: E402

