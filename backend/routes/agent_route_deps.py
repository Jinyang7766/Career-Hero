def build_agent_route_deps(**deps):
    return {
        "token_required": deps["token_required"],
        "run_service": deps["run_service"],
        "tool_runtime_service": deps.get("tool_runtime_service"),
        "event_repository": deps.get("event_repository"),
        "intent_router": deps.get("intent_router"),
        "intent_confidence_threshold": deps.get("intent_confidence_threshold"),
        "mock_worker_enabled": deps.get("mock_worker_enabled"),
    }
