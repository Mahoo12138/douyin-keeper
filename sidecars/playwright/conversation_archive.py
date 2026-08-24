"""Platform-side conversation archive contract.

The local product archive is deliberately separate from this adapter action.
This module validates the future Sidecar input shape, then fails closed until
the real Douyin archive selector and confirmation flow are deployed.
"""

import protocol


def archive(input_data):
    """Validate an archive request without pretending the platform changed."""
    protocol._session_file(input_data)
    target = input_data.get("target") if isinstance(input_data, dict) else None
    if not isinstance(target, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "target is required")
    conversation_id = target.get("platform_conversation_id")
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "platform_conversation_id is required")
    if type(input_data.get("archived")) is not bool:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "archived must be boolean")
    raise protocol.ProtocolError(
        protocol.ERR_PLATFORM_ARCHIVE_UNAVAILABLE,
        "platform conversation archive adapter is not configured",
        detail={"operation": "conversations.archive", "reason": "selector_not_configured"},
    )
