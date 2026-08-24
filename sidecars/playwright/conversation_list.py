"""Platform conversation-list contract for Sidecar Protocol v1.

The product-side conversation index is backed by PostgreSQL. This adapter
boundary is for a future platform sync and must not return an empty successful
page while its selectors are unavailable.
"""

import protocol


def list_conversations(input_data):
    """Validate the future list input, then fail closed until selectors land."""
    if not isinstance(input_data, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input must be an object")
    allowed = {"session", "cursor", "limit"}
    if set(input_data) - allowed:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")

    protocol._session_file(input_data)

    cursor = input_data.get("cursor")
    if cursor is not None and (not isinstance(cursor, str) or not cursor.strip() or len(cursor) > 512):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "cursor must be a non-empty string or null")

    limit = input_data.get("limit", 100)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "limit must be between 1 and 100")

    raise protocol.ProtocolError(
        protocol.ERR_ADAPTER_UNAVAILABLE,
        "platform conversation list adapter is not configured",
        detail={"operation": "conversations.list", "reason": "selector_not_configured"},
    )
