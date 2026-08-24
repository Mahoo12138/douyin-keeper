"""Fail-closed input contract for the future browser sticker sender."""

import protocol


def send_sticker(input_data):
    """Validate stable target/message identifiers without guessing page selectors."""
    if not isinstance(input_data, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input must be an object")
    if set(input_data) - {"session", "target", "message"}:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "input contains unknown fields")

    protocol._session_file(input_data)
    target = input_data.get("target")
    message = input_data.get("message")
    if not isinstance(target, dict) or not isinstance(message, dict):
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "target and message are required")
    if set(target) - {"platform_conversation_id", "platform_user_id"}:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "target contains unknown fields")
    if set(message) - {"sticker_id"}:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "message contains unknown fields")
    conversation_id = target.get("platform_conversation_id")
    platform_user_id = target.get("platform_user_id")
    sticker_id = message.get("sticker_id")
    if not isinstance(conversation_id, str) or not conversation_id.strip() or len(conversation_id) > 512:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "platform_conversation_id must be 1..512 characters")
    if not isinstance(platform_user_id, str) or not platform_user_id.strip() or len(platform_user_id) > 256:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "platform_user_id must be 1..256 characters")
    if not isinstance(sticker_id, str) or not sticker_id.strip() or len(sticker_id) > 256:
        raise protocol.ProtocolError(protocol.ERR_INVALID_REQUEST, "message.sticker_id must be 1..256 characters")

    raise protocol.ProtocolError(
        protocol.ERR_ADAPTER_UNAVAILABLE,
        "sticker adapter is not configured",
        detail={"operation": "message.send_sticker", "reason": "selector_not_configured"},
    )
