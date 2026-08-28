function conversationTypeFromValue(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["2", "group", "群聊", "multi", "多人"].includes(text)) return "group";
  if (["1", "direct", "single", "单聊"].includes(text)) return "direct";
  return "unknown";
}

function conversationTypeFromID(value) {
  const parts = String(value || "").trim().split(":");
  if (parts.length >= 3 && parts[1] === "1") return "direct";
  if (parts.length >= 3 && parts[1] === "2") return "group";
  return "unknown";
}

export function filterConversationRows(rows, groupOnly = false, authoritativeGroupIDs = null) {
  if (!groupOnly) return rows || [];
  return (rows || []).filter((row) => {
    const conversationID = String(row?.platform_conversation_id || "").trim();
    const declared = conversationTypeFromValue(row?.conversation_type);
    if (authoritativeGroupIDs?.size) return authoritativeGroupIDs.has(conversationID);
    const inferred = conversationTypeFromID(conversationID);
    if (inferred === "direct") return false;
    return inferred === "group" || (inferred === "unknown" && declared === "group");
  });
}

export function finalizeConversationInventory(rows, groupOnly = false, authoritativeGroupIDs = new Set()) {
  const inventory = (rows || []).filter((row) => String(row?.platform_conversation_id || "").trim());
  return filterConversationRows(inventory, groupOnly, authoritativeGroupIDs);
}

export function mergeConversationInventoryCandidate(existing, incoming, existingQuality = 0, incomingQuality = 0) {
  if (!existing) return incoming;
  if (incomingQuality < existingQuality) {
    const merged = { ...existing };
    const existingName = String(existing.peer_display_name || "").trim();
    const incomingName = String(incoming.peer_display_name || "").trim();
    if ((!existingName || existingName === "群聊") && incomingName) merged.peer_display_name = incomingName;
    if (!existing.peer_platform_user_id && incoming.peer_platform_user_id) merged.peer_platform_user_id = incoming.peer_platform_user_id;
    if (!existing.peer_avatar_url && incoming.peer_avatar_url) merged.peer_avatar_url = incoming.peer_avatar_url;
    if ((!existing.conversation_type || existing.conversation_type === "unknown") && incoming.conversation_type) {
      merged.conversation_type = incoming.conversation_type;
    }
    if ((existing.streak_days === null || existing.streak_days === undefined)
      && incoming.streak_days !== null && incoming.streak_days !== undefined) {
      merged.streak_days = incoming.streak_days;
    }
    if (!existing.last_message_at && incoming.last_message_at) merged.last_message_at = incoming.last_message_at;
    return merged;
  }
  const merged = { ...incoming };
  const existingName = String(existing.peer_display_name || "").trim();
  const incomingName = String(incoming.peer_display_name || "").trim();
  if (existingName && existingName !== "群聊" && incomingName === "群聊") {
    merged.peer_display_name = existingName;
  }
  if (existing.peer_avatar_url && !incoming.peer_avatar_url) merged.peer_avatar_url = existing.peer_avatar_url;
  if (existing.streak_days !== null && existing.streak_days !== undefined
    && (incoming.streak_days === null || incoming.streak_days === undefined)) {
    merged.streak_days = existing.streak_days;
  }
  return merged;
}

export function collectorItemsAfterSequence(items, sequence) {
  const cursor = Number.isSafeInteger(sequence) ? sequence : 0;
  return (items || []).filter((item) => Number.isSafeInteger(item?.sequence) && item.sequence > cursor);
}

export function selectClickedConversationIdentity(domConversationID, candidates) {
  const unique = [...new Map((candidates || [])
    .map((candidate) => ({
      conversationID: String(candidate?.conversationID || "").trim(),
      conversationType: conversationTypeFromValue(candidate?.conversationType),
    }))
    .filter((candidate) => candidate.conversationID)
    .map((candidate) => [candidate.conversationID, candidate])).values()];
  if (unique.length === 1) {
    return { ...unique[0], authoritative: true };
  }
  if (unique.length === 2) {
    const direct = unique.filter((candidate) => candidate.conversationType === "direct");
    const unknown = unique.filter((candidate) => candidate.conversationType === "unknown");
    if (direct.length === 1 && unknown.length === 1) {
      return {
        conversationID: direct[0].conversationID,
        conversationType: "direct",
        authoritative: true,
      };
    }
  }
  return {
    conversationID: String(domConversationID || "").trim() || null,
    conversationType: "unknown",
    authoritative: false,
  };
}
