"""Platform-side conversation archive contract.

The local product archive is deliberately separate from this adapter action.
This module validates the future Sidecar input shape, then fails closed until
the real Douyin archive selector and confirmation flow are deployed.
"""

import protocol


def archive(input_data):
    """Validate an archive request without pretending the platform changed."""
    if not isinstance(input_data, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "archived"}:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")
    protocol._session_file(input_data)
    target = input_data.get("target") if isinstance(input_data, dict) else None
    if not isinstance(target, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "target is required")
    if set(target) - {"platform_user_id", "platform_conversation_id"}:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    platform_user_id = target.get("platform_user_id")
    if platform_user_id is not None and (not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters when provided")
    if type(input_data.get("archived")) is not bool:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "archived must be boolean")
    raise protocol.ProtocolError(
        protocol.ERR_PLATFORM_ARCHIVE_UNAVAILABLE,
        "platform conversation archive adapter is not configured",
        detail={"operation": "conversations.archive", "reason": "selector_not_configured"},
    )
