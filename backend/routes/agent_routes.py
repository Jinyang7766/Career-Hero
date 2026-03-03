from __future__ import annotations

import json
from uuid import UUID

from flask import jsonify, request

try:
    from agent.intent_router import RuleIntentRouter
    from agent.run_service import RunCreateCommand
    from agent.tool_runtime import (
        ToolConfirmExpiredError,
        ToolConfirmNotRequiredError,
        ToolConfirmTokenError,
        ToolIdempotencyConflictError,
        ToolRunNotFoundError,
        ToolRunStateError,
    )
    from agent.trace_id import generate_trace_id
except ImportError:
    from backend.agent.intent_router import RuleIntentRouter
    from backend.agent.run_service import RunCreateCommand
    from backend.agent.tool_runtime import (
        ToolConfirmExpiredError,
        ToolConfirmNotRequiredError,
        ToolConfirmTokenError,
        ToolIdempotencyConflictError,
        ToolRunNotFoundError,
        ToolRunStateError,
    )
    from backend.agent.trace_id import generate_trace_id


def _error_response(
    *,
    code: str,
    message: str,
    trace_id: str,
    retryable: bool = False,
    run_id: str | None = None,
):
    payload = {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "trace_id": trace_id,
        }
    }
    if run_id:
        payload["error"]["run_id"] = run_id
    return payload


def _extract_trace_id() -> str:
    header_trace = (request.headers.get("X-Client-Trace-Id") or "").strip()
    if header_trace:
        return header_trace
    return generate_trace_id()


def _get_json_payload(req):
    data = req.get_json(silent=True)
    if data is None:
        return {}
    return data


def _parse_optional_uuid(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return UUID(text)


def _extract_idempotency_key(data):
    header_idempotency = (request.headers.get("Idempotency-Key") or "").strip()
    body_idempotency = str(data.get("idempotency_key") or "").strip()
    if header_idempotency and body_idempotency and header_idempotency != body_idempotency:
        raise ValueError("idempotency_key_mismatch")
    return header_idempotency or body_idempotency or None


def _canonical_json_object(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    return {}


def _signature_slots(value):
    try:
        return json.loads(
            json.dumps(_canonical_json_object(value), ensure_ascii=False, sort_keys=True)
        )
    except Exception:
        return {}


def _build_create_run_signature(
    *,
    intent: str,
    thread_id: UUID | None,
    goal_id: UUID | None,
    analysis_mode: str | None,
    generation_strategy: str | None,
    jd_key: str | None,
    slots: dict | None,
):
    return {
        "intent": str(intent or "").strip(),
        "thread_id": str(thread_id) if thread_id else None,
        "goal_id": str(goal_id) if goal_id else None,
        "analysis_mode": str(analysis_mode or "").strip().lower() or None,
        "generation_strategy": str(generation_strategy or "").strip().lower() or None,
        "jd_key": str(jd_key or "").strip() or None,
        "slots": _signature_slots(slots),
    }


def _extract_run_created_signature(*, event_repository, user_id: UUID, run_id: UUID):
    if event_repository is None:
        return None
    rows, _ = event_repository.list_by_run(
        user_id=user_id,
        run_id=run_id,
        limit=20,
    )
    if not rows:
        return None
    for row in rows:
        if str(row.get("event_type") or "").strip() != "run_created":
            continue
        payload = row.get("event_payload") or {}
        try:
            thread_id = _parse_optional_uuid(payload.get("thread_id"))
        except ValueError:
            thread_id = None
        try:
            goal_id = _parse_optional_uuid(payload.get("goal_id"))
        except ValueError:
            goal_id = None
        return _build_create_run_signature(
            intent=str(payload.get("intent") or "").strip(),
            thread_id=thread_id,
            goal_id=goal_id,
            analysis_mode=str(payload.get("analysis_mode") or "").strip().lower() or None,
            generation_strategy=str(payload.get("generation_strategy") or "").strip().lower()
            or None,
            jd_key=str(payload.get("jd_key") or "").strip() or None,
            slots=_canonical_json_object(payload.get("slots")),
        )
    return None


def _build_retry_response(*, run, prev_state: str, trace_id: str):
    return {
        "run_id": str(run.id),
        "prev_state": prev_state,
        "next_state": run.state,
        "attempt_no": run.attempt_no,
        "trace_id": run.trace_id or trace_id,
    }


def _build_cancel_response(*, cancel_result, trace_id: str):
    return {
        "run_id": str(cancel_result.run.id),
        "prev_state": cancel_result.prev_state,
        "next_state": cancel_result.next_state,
        "idempotent": cancel_result.idempotent,
        "trace_id": cancel_result.run.trace_id or trace_id,
    }


def _build_simulate_response(*, run, prev_state: str, idempotent: bool, trace_id: str):
    return {
        "run_id": str(run.id),
        "prev_state": prev_state,
        "next_state": run.state,
        "attempt_no": run.attempt_no,
        "idempotent": idempotent,
        "trace_id": run.trace_id or trace_id,
    }


def _build_execute_response(*, result, trace_id: str):
    return {
        "tool_run_id": str(result.tool_run.id),
        "status": result.tool_run.status,
        "run_id": str(result.run.id),
        "requires_confirm": result.requires_confirm,
        "confirm_token": result.confirm_token if result.requires_confirm else None,
        "confirm_expires_at": result.confirm_expires_at if result.requires_confirm else None,
        "idempotent": result.idempotent,
        "trace_id": result.run.trace_id or trace_id,
    }


def _build_confirm_response(*, result, trace_id: str):
    return {
        "run_id": str(result.run.id),
        "tool_run_id": str(result.tool_run.id),
        "prev_state": result.prev_state,
        "next_state": result.next_state,
        "committed": result.committed,
        "idempotent": result.idempotent,
        "trace_id": result.run.trace_id or trace_id,
    }


def _normalize_feedback_event_type(raw_event_type: str) -> str | None:
    value = str(raw_event_type or "").strip().lower()
    mapping = {
        "accept": "user_feedback_accept",
        "ignore": "user_feedback_ignore",
        "correct": "user_feedback_correct",
        "user_feedback_accept": "user_feedback_accept",
        "user_feedback_ignore": "user_feedback_ignore",
        "user_feedback_correct": "user_feedback_correct",
    }
    return mapping.get(value)


def _extract_pagination():
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(200, int(limit_raw)))
    except Exception:
        limit = 50
    cursor = (request.args.get("cursor") or "").strip() or None
    return limit, cursor


def register_agent_routes(app, deps):
    token_required = deps["token_required"]
    run_service = deps["run_service"]
    tool_runtime_service = deps.get("tool_runtime_service")
    event_repository = deps.get("event_repository")
    intent_router = deps.get("intent_router") or RuleIntentRouter()
    confidence_threshold = float(deps.get("intent_confidence_threshold") or 0.45)
    mock_worker_enabled = bool(deps.get("mock_worker_enabled"))
    allowed_analysis_modes = {"generic", "targeted"}
    allowed_generation_strategies = {"reuse", "create_new", "overwrite"}

    @app.route("/api/agent/intent", methods=["POST"])
    @token_required
    def detect_agent_intent(current_user_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        text = data.get("text")
        if not isinstance(text, str) or not text.strip():
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="text is required and must be a non-empty string",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            _parse_optional_uuid(data.get("thread_id"))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid thread_id",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        context = data.get("context") or {}
        if context and not isinstance(context, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="context must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        decision = intent_router.route(text=text, context=context)
        if decision.confidence < confidence_threshold:
            body = _error_response(
                code="AGENT_CONFIDENCE_TOO_LOW",
                message="intent confidence is below threshold",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        return (
            jsonify(
                {
                    "intent": decision.intent,
                    "confidence": round(decision.confidence, 4),
                    "slots": decision.slots,
                    "route": decision.route,
                    "trace_id": trace_id,
                }
            ),
            200,
        )

    @app.route("/api/agent/runs", methods=["POST"])
    @token_required
    def create_agent_run(current_user_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        intent = str(data.get("intent") or "").strip()
        if not intent:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="intent is required",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        raw_slots = data.get("slots")
        if raw_slots is not None and not isinstance(raw_slots, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="slots must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422
        slots = raw_slots if isinstance(raw_slots, dict) else None

        analysis_mode_raw = str(data.get("analysis_mode") or "").strip().lower()
        analysis_mode = analysis_mode_raw or None
        if analysis_mode and analysis_mode not in allowed_analysis_modes:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="analysis_mode must be one of: generic,targeted",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        generation_strategy_raw = (
            str(data.get("generation_strategy") or "").strip().lower()
        )
        generation_strategy = generation_strategy_raw or None
        if generation_strategy and generation_strategy not in allowed_generation_strategies:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="generation_strategy must be one of: reuse,create_new,overwrite",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        jd_key = str(data.get("jd_key") or "").strip() or None

        try:
            idempotency_key = _extract_idempotency_key(data)
        except ValueError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="header and body idempotency key mismatch",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        try:
            user_id = UUID(str(current_user_id))
            thread_id = _parse_optional_uuid(data.get("thread_id"))
            goal_id = _parse_optional_uuid(data.get("goal_id"))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid uuid in request",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        requested_signature = _build_create_run_signature(
            intent=intent,
            thread_id=thread_id,
            goal_id=goal_id,
            analysis_mode=analysis_mode,
            generation_strategy=generation_strategy,
            jd_key=jd_key,
            slots=slots,
        )

        if idempotency_key and hasattr(run_service, "get_run_by_request_idempotency"):
            existing_run = run_service.get_run_by_request_idempotency(
                user_id=user_id,
                request_idempotency_key=idempotency_key,
            )
            if existing_run is not None:
                try:
                    existing_signature = _extract_run_created_signature(
                        event_repository=event_repository,
                        user_id=user_id,
                        run_id=existing_run.id,
                    )
                except Exception:
                    existing_signature = None
                if existing_signature is None:
                    existing_signature = _build_create_run_signature(
                        intent=existing_run.intent,
                        thread_id=existing_run.thread_id,
                        goal_id=existing_run.goal_id,
                        analysis_mode=None,
                        generation_strategy=None,
                        jd_key=None,
                        slots=None,
                    )
                if existing_signature != requested_signature:
                    body = _error_response(
                        code="AGENT_IDEMPOTENCY_CONFLICT",
                        message="idempotency key already used for another create payload",
                        trace_id=trace_id,
                        retryable=False,
                    )
                    return jsonify(body), 409
                return (
                    jsonify(
                        {
                            "run_id": str(existing_run.id),
                            "state": existing_run.state,
                            "attempt_no": existing_run.attempt_no,
                            "trace_id": existing_run.trace_id or trace_id,
                        }
                    ),
                    200,
                )

        try:
            run = run_service.create_run(
                RunCreateCommand(
                    user_id=user_id,
                    intent=intent,
                    thread_id=thread_id,
                    goal_id=goal_id,
                    idempotency_key=idempotency_key,
                    slots=slots,
                    analysis_mode=analysis_mode,
                    generation_strategy=generation_strategy,
                    jd_key=jd_key,
                )
            )
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to create run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        return (
            jsonify(
                {
                    "run_id": str(run.id),
                    "state": run.state,
                    "attempt_no": run.attempt_no,
                    "trace_id": run.trace_id or trace_id,
                }
            ),
            200,
        )

    @app.route("/api/agent/runs/<run_id>", methods=["GET"])
    @token_required
    def get_agent_run(current_user_id, run_id):
        trace_id = _extract_trace_id()

        try:
            run_uuid = UUID(str(run_id))
        except ValueError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        return (
            jsonify(
                {
                    "run_id": str(run.id),
                    "state": run.state,
                    "attempt_no": run.attempt_no,
                    "error_code": None,
                    "trace_id": run.trace_id or trace_id,
                }
            ),
            200,
        )

    @app.route("/api/agent/execute", methods=["POST"])
    @token_required
    def execute_agent_tool(current_user_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        if tool_runtime_service is None:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="tool runtime is unavailable",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        try:
            idempotency_key = _extract_idempotency_key(data)
        except ValueError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="header and body idempotency key mismatch",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        run_id_raw = data.get("run_id")
        tool_name = str(data.get("tool_name") or "").strip()
        if not run_id_raw or not tool_name:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="run_id and tool_name are required",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        dry_run = data.get("dry_run", True)
        if not isinstance(dry_run, bool):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="dry_run must be a boolean",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        input_payload = data.get("input") or {}
        if input_payload and not isinstance(input_payload, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="input must be a JSON object",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        try:
            run_uuid = UUID(str(run_id_raw))
            user_uuid = UUID(str(current_user_id))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid run_id or authenticated user id",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            result = tool_runtime_service.execute(
                run=run,
                user_id=user_uuid,
                tool_name=tool_name,
                dry_run=dry_run,
                input_payload=input_payload,
                idempotency_key=idempotency_key,
            )
        except ToolIdempotencyConflictError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="idempotency key already used for another execute payload",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except ToolRunStateError:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow execute",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except ValueError as exc:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message=str(exc),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to execute tool",
                trace_id=trace_id,
                retryable=True,
                run_id=str(run_uuid),
            )
            return jsonify(body), 500

        return jsonify(_build_execute_response(result=result, trace_id=trace_id)), 200

    @app.route("/api/agent/runs/<run_id>/confirm", methods=["POST"])
    @token_required
    def confirm_agent_tool_run(current_user_id, run_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        if tool_runtime_service is None:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="tool runtime is unavailable",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        tool_run_id_raw = data.get("tool_run_id")
        confirm_token = str(data.get("confirm_token") or "").strip()
        if not tool_run_id_raw or not confirm_token:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="tool_run_id and confirm_token are required",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        try:
            run_uuid = UUID(str(run_id))
            tool_run_uuid = UUID(str(tool_run_id_raw))
            user_uuid = UUID(str(current_user_id))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid run_id, tool_run_id, or authenticated user id",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            result = tool_runtime_service.confirm(
                run=run,
                user_id=user_uuid,
                tool_run_id=tool_run_uuid,
                confirm_token=confirm_token,
            )
        except ToolRunNotFoundError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="tool run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 404
        except ToolConfirmExpiredError:
            body = _error_response(
                code="AGENT_CONFIRMATION_EXPIRED",
                message="confirmation token expired",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 410
        except (ToolConfirmTokenError, ToolConfirmNotRequiredError):
            body = _error_response(
                code="AGENT_CONFIRMATION_REQUIRED",
                message="confirmation token is invalid or no confirmation is required",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except ToolRunStateError:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow confirm",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to confirm tool run",
                trace_id=trace_id,
                retryable=True,
                run_id=str(run_uuid),
            )
            return jsonify(body), 500

        return jsonify(_build_confirm_response(result=result, trace_id=trace_id)), 200

    @app.route("/api/agent/runs/<run_id>/retry", methods=["POST"])
    @token_required
    def retry_agent_run(current_user_id, run_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            idempotency_key = _extract_idempotency_key(data)
        except ValueError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="header and body idempotency key mismatch",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        try:
            run_uuid = UUID(str(run_id))
        except ValueError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        if idempotency_key and event_repository and hasattr(event_repository, "get_by_idempotency"):
            existing = event_repository.get_by_idempotency(
                user_id=current_user_id, event_idempotency_key=idempotency_key
            )
            if existing is not None:
                existing_run_id = str(existing.get("run_id") or "")
                existing_type = str(existing.get("event_type") or "")
                payload = existing.get("event_payload") or {}
                if existing_run_id != str(run_uuid) or existing_type != "run_retried":
                    body = _error_response(
                        code="AGENT_IDEMPOTENCY_CONFLICT",
                        message="idempotency key already used for another action",
                        trace_id=trace_id,
                        retryable=False,
                        run_id=str(run_uuid),
                    )
                    return jsonify(body), 409
                return (
                    jsonify(
                        {
                            "run_id": existing_run_id,
                            "prev_state": payload.get("prev_state"),
                            "next_state": payload.get("next_state"),
                            "attempt_no": payload.get("attempt_no"),
                            "trace_id": str(existing.get("trace_id") or trace_id),
                        }
                    ),
                    200,
                )

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        prev_state = run.state
        try:
            updated_run = run_service.retry_run(run, request_idempotency_key=idempotency_key)
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow retry",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to retry run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        response = _build_retry_response(run=updated_run, prev_state=prev_state, trace_id=trace_id)
        return (
            jsonify(response),
            200,
        )

    @app.route("/api/agent/runs/<run_id>/cancel", methods=["POST"])
    @token_required
    def cancel_agent_run(current_user_id, run_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            idempotency_key = _extract_idempotency_key(data)
        except ValueError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="header and body idempotency key mismatch",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        reason = data.get("reason")
        if reason is not None and not isinstance(reason, str):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="reason must be a string",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            run_uuid = UUID(str(run_id))
        except ValueError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        if idempotency_key and event_repository and hasattr(event_repository, "get_by_idempotency"):
            existing = event_repository.get_by_idempotency(
                user_id=current_user_id, event_idempotency_key=idempotency_key
            )
            if existing is not None:
                existing_run_id = str(existing.get("run_id") or "")
                existing_type = str(existing.get("event_type") or "")
                payload = existing.get("event_payload") or {}
                if existing_run_id != str(run_uuid) or existing_type != "run_canceled":
                    body = _error_response(
                        code="AGENT_IDEMPOTENCY_CONFLICT",
                        message="idempotency key already used for another action",
                        trace_id=trace_id,
                        retryable=False,
                        run_id=str(run_uuid),
                    )
                    return jsonify(body), 409
                return (
                    jsonify(
                        {
                            "run_id": existing_run_id,
                            "prev_state": payload.get("prev_state"),
                            "next_state": payload.get("next_state"),
                            "idempotent": bool(payload.get("idempotent")),
                            "trace_id": str(existing.get("trace_id") or trace_id),
                        }
                    ),
                    200,
                )

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            cancel_result = run_service.cancel_run(
                run,
                reason=reason,
                request_idempotency_key=idempotency_key,
            )
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow cancel",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to cancel run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        response = _build_cancel_response(cancel_result=cancel_result, trace_id=trace_id)
        return (
            jsonify(response),
            200,
        )

    @app.route("/api/agent/runs/<run_id>/events", methods=["GET"])
    @token_required
    def get_agent_run_events(current_user_id, run_id):
        trace_id = _extract_trace_id()
        try:
            run_uuid = UUID(str(run_id))
        except ValueError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        limit, cursor = _extract_pagination()

        events = []
        next_cursor = None
        if event_repository and hasattr(event_repository, "list_by_run"):
            try:
                rows, next_cursor = event_repository.list_by_run(
                    user_id=current_user_id,
                    run_id=run_uuid,
                    limit=limit,
                    cursor=cursor,
                )
                for row in rows:
                    events.append(
                        {
                            "event_id": row.get("id"),
                            "event_type": row.get("event_type"),
                            "run_id": str(row.get("run_id") or run_uuid),
                            "thread_id": str(row.get("thread_id")) if row.get("thread_id") else None,
                            "created_at": row.get("created_at"),
                            "trace_id": row.get("trace_id"),
                            "source": row.get("source"),
                            "event_payload": row.get("event_payload") or {},
                        }
                    )
            except ValueError:
                body = _error_response(
                    code="AGENT_INVALID_REQUEST",
                    message="invalid cursor",
                    trace_id=trace_id,
                    retryable=False,
                    run_id=str(run_uuid),
                )
                return jsonify(body), 422
            except Exception:
                body = _error_response(
                    code="AGENT_INTERNAL_ERROR",
                    message="failed to fetch run events",
                    trace_id=trace_id,
                    retryable=True,
                    run_id=str(run_uuid),
                )
                return jsonify(body), 500

        return jsonify({"events": events, "next_cursor": next_cursor, "trace_id": trace_id}), 200

    @app.route("/api/agent/runs/<run_id>/simulate", methods=["POST"])
    @token_required
    def simulate_agent_run_lifecycle(current_user_id, run_id):
        trace_id = _extract_trace_id()
        if not mock_worker_enabled:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            run_uuid = UUID(str(run_id))
        except ValueError:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_id),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        try:
            run = run_service.get_run(run_uuid, current_user_id)
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to get run",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500
        if run is None:
            body = _error_response(
                code="AGENT_RUN_NOT_FOUND",
                message="run not found",
                run_id=str(run_uuid),
                trace_id=trace_id,
            )
            return jsonify(body), 404

        initial_prev_state = run.state
        if run.state == "succeeded":
            response = _build_simulate_response(
                run=run,
                prev_state=initial_prev_state,
                idempotent=True,
                trace_id=trace_id,
            )
            return jsonify(response), 200

        if run.state not in {"queued", "running"}:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow simulate completion",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        try:
            if run.state == "queued":
                start_result = run_service.start_run(run)
                run = start_result.run
            success_result = run_service.succeed_run(run)
            run = success_result.run
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_STATE_TRANSITION",
                message="run state does not allow simulate completion",
                run_id=str(run_uuid),
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to simulate run completion",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        response = _build_simulate_response(
            run=run,
            prev_state=initial_prev_state,
            idempotent=False,
            trace_id=trace_id,
        )
        return jsonify(response), 200

    @app.route("/api/agent/timeline", methods=["GET"])
    @token_required
    def get_agent_timeline(current_user_id):
        trace_id = _extract_trace_id()
        try:
            thread_uuid = _parse_optional_uuid(request.args.get("thread_id"))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid thread_id",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        if thread_uuid is None:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="thread_id is required",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 422

        limit, cursor = _extract_pagination()
        events = []
        next_cursor = None
        if event_repository and hasattr(event_repository, "list_by_thread"):
            try:
                rows, next_cursor = event_repository.list_by_thread(
                    user_id=current_user_id,
                    thread_id=thread_uuid,
                    limit=limit,
                    cursor=cursor,
                )
                for row in rows:
                    events.append(
                        {
                            "event_id": row.get("id"),
                            "event_type": row.get("event_type"),
                            "run_id": str(row.get("run_id")) if row.get("run_id") else None,
                            "thread_id": str(row.get("thread_id") or thread_uuid),
                            "created_at": row.get("created_at"),
                            "trace_id": row.get("trace_id"),
                            "source": row.get("source"),
                            "event_payload": row.get("event_payload") or {},
                        }
                    )
            except ValueError:
                body = _error_response(
                    code="AGENT_INVALID_REQUEST",
                    message="invalid cursor",
                    trace_id=trace_id,
                    retryable=False,
                )
                return jsonify(body), 422
            except Exception:
                body = _error_response(
                    code="AGENT_INTERNAL_ERROR",
                    message="failed to fetch timeline events",
                    trace_id=trace_id,
                    retryable=True,
                )
                return jsonify(body), 500

        return jsonify({"events": events, "next_cursor": next_cursor, "trace_id": trace_id}), 200

    @app.route("/api/agent/feedback", methods=["POST"])
    @token_required
    def record_agent_feedback(current_user_id):
        trace_id = _extract_trace_id()
        data = _get_json_payload(request)
        if not isinstance(data, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="request body must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        if not event_repository or not hasattr(event_repository, "save_event"):
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="feedback repository is unavailable",
                trace_id=trace_id,
                retryable=True,
            )
            return jsonify(body), 500

        try:
            idempotency_key = _extract_idempotency_key(data)
        except ValueError:
            body = _error_response(
                code="AGENT_IDEMPOTENCY_CONFLICT",
                message="header and body idempotency key mismatch",
                trace_id=trace_id,
                retryable=False,
            )
            return jsonify(body), 409

        try:
            user_uuid = UUID(str(current_user_id))
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid authenticated user id",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        run_id_raw = data.get("run_id")
        thread_id_raw = data.get("thread_id")
        if not run_id_raw and not thread_id_raw:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="run_id or thread_id is required",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        try:
            run_uuid = _parse_optional_uuid(run_id_raw)
            thread_uuid = _parse_optional_uuid(thread_id_raw)
        except ValueError:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="invalid run_id or thread_id",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        feedback_event_type = _normalize_feedback_event_type(data.get("event_type"))
        if not feedback_event_type:
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="event_type must be one of: accept, ignore, correct",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        payload = data.get("payload") or {}
        if payload and not isinstance(payload, dict):
            body = _error_response(
                code="AGENT_INVALID_REQUEST",
                message="payload must be a JSON object",
                trace_id=trace_id,
            )
            return jsonify(body), 422

        run = None
        if run_uuid is not None:
            try:
                run = run_service.get_run(run_uuid, current_user_id)
            except Exception:
                body = _error_response(
                    code="AGENT_INTERNAL_ERROR",
                    message="failed to get run",
                    trace_id=trace_id,
                    retryable=True,
                )
                return jsonify(body), 500
            if run is None:
                body = _error_response(
                    code="AGENT_RUN_NOT_FOUND",
                    message="run not found",
                    run_id=str(run_uuid),
                    trace_id=trace_id,
                )
                return jsonify(body), 404
            user_uuid = run.user_id
            if thread_uuid is not None and run.thread_id is not None and thread_uuid != run.thread_id:
                body = _error_response(
                    code="AGENT_INVALID_REQUEST",
                    message="thread_id does not match run",
                    run_id=str(run_uuid),
                    trace_id=trace_id,
                )
                return jsonify(body), 422
            if thread_uuid is None:
                thread_uuid = run.thread_id

        if idempotency_key and hasattr(event_repository, "get_by_idempotency"):
            existing = event_repository.get_by_idempotency(
                user_id=user_uuid, event_idempotency_key=idempotency_key
            )
            if existing is not None:
                existing_run_id = str(existing.get("run_id") or "")
                existing_thread_id = str(existing.get("thread_id") or "")
                existing_type = str(existing.get("event_type") or "")
                requested_run_id = str(run_uuid) if run_uuid is not None else ""
                requested_thread_id = str(thread_uuid) if thread_uuid is not None else ""
                if (
                    existing_run_id != requested_run_id
                    or existing_thread_id != requested_thread_id
                    or existing_type != feedback_event_type
                ):
                    body = _error_response(
                        code="AGENT_IDEMPOTENCY_CONFLICT",
                        message="idempotency key already used for another action",
                        trace_id=trace_id,
                        retryable=False,
                        run_id=str(run_uuid) if run_uuid else None,
                    )
                    return jsonify(body), 409
                return (
                    jsonify(
                        {
                            "event_id": existing.get("id"),
                            "event_type": existing_type,
                            "run_id": existing.get("run_id"),
                            "thread_id": existing.get("thread_id"),
                            "replayed": True,
                            "trace_id": str(existing.get("trace_id") or trace_id),
                        }
                    ),
                    200,
                )

        try:
            saved = event_repository.save_event(
                user_id=user_uuid,
                run_id=run_uuid,
                thread_id=thread_uuid,
                event_type=feedback_event_type,
                trace_id=run.trace_id if run is not None else trace_id,
                event_payload=payload,
                source="user_feedback",
                event_idempotency_key=idempotency_key,
            )
        except Exception:
            body = _error_response(
                code="AGENT_INTERNAL_ERROR",
                message="failed to write feedback event",
                trace_id=trace_id,
                retryable=True,
                run_id=str(run_uuid) if run_uuid else None,
            )
            return jsonify(body), 500

        return (
            jsonify(
                {
                    "event_id": saved.get("id"),
                    "event_type": feedback_event_type,
                    "run_id": str(run_uuid) if run_uuid else None,
                    "thread_id": str(thread_uuid) if thread_uuid else None,
                    "replayed": False,
                    "trace_id": str(saved.get("trace_id") or (run.trace_id if run is not None else trace_id)),
                }
            ),
            200,
        )
