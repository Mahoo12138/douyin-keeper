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

function normalizedDisplayName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function conversationRowHydrationKey(row) {
  const displayName = normalizedDisplayName(row?.peer_display_name);
  // data-index is a virtual-list slot, not an identity: selecting a chat can
  // move the same named row to another slot. Douyin's visible name is the
  // authoritative join key for named rows and for the responses they trigger.
  if (displayName && displayName !== "群聊") return `title:${displayName}`;
  const dataIndex = String(row?.data_index || "").trim();
  if (/^\d+$/.test(dataIndex)) {
    return `index:${dataIndex}:title:${displayName}`;
  }
  const conversationID = String(row?.platform_conversation_id || "").trim();
  if (conversationID) return `conversation:${conversationID}`;
  const peerID = String(row?.peer_platform_user_id || "").trim();
  if (peerID) return `peer:${peerID}`;
  return `row:${String(row?._row_key || row?._source_index || "unknown")}`;
}

export function conversationRowInventoryKey(row) {
  const dataIndex = String(row?.data_index || "").trim();
  if (/^\d+$/.test(dataIndex)) return `index:${dataIndex}`;
  return conversationRowHydrationKey(row);
}

// Clicking a row can immediately reorder Douyin's virtualized conversation
// list. Only one row from an extracted DOM snapshot may therefore be used for
// hydration; the caller must read the list again before selecting another row.
export function selectConversationHydrationBatch(rows, hydratedKeys, unsupportedKeys = new Set()) {
  const row = (rows || []).find((candidate) => {
    const key = conversationRowHydrationKey(candidate);
    return !hydratedKeys?.has?.(key) && !unsupportedKeys?.has?.(key);
  });
  return row ? [row] : [];
}

export function missingConversationInventoryIndexes(observedIndexes, inventoryKeys) {
  const keys = inventoryKeys instanceof Set ? inventoryKeys : new Set(inventoryKeys || []);
  return [...(observedIndexes || [])]
    .filter((index) => Number.isSafeInteger(Number(index)) && !keys.has(`index:${Number(index)}`))
    .map(Number)
    .sort((left, right) => left - right);
}

export function conversationVerificationNeedsRescan(inventoryCount, hydratedIdentityCount, passHadHydration) {
  return passHadHydration === true || Number(inventoryCount) < Number(hydratedIdentityCount);
}

export function conversationInventoryIdentityCount(rows) {
  const identities = new Set();
  for (const row of rows || []) {
    const conversationID = String(row?.platform_conversation_id || "").trim();
    if (conversationID) identities.add(`conversation:${conversationID}`);
  }
  return identities.size;
}

export function applyConversationHydrationCache(rows, cache) {
  return (rows || []).map((row) => {
    const cached = cache?.get?.(conversationRowHydrationKey(row));
    if (!cached) return row;
    return {
      ...row,
      ...cached,
      // The rendered row is authoritative for list membership and label.
      // Cached interface data only supplies the stable platform identity and
      // fields that are not directly available from the current DOM snapshot.
      peer_display_name: normalizedDisplayName(row.peer_display_name)
        || normalizedDisplayName(cached.peer_display_name),
      data_index: row.data_index,
      _row_key: row._row_key,
      _source_index: row._source_index,
    };
  });
}

export function identityRecordsMatchDisplayName(records, displayName) {
  const expected = normalizedDisplayName(displayName);
  if (!expected) return false;
  const labelKeys = ["nickname", "display_name", "username", "user_name", "name", "title", "conversation_name", "group_name"];
  return (records || []).some((record) => {
    const values = [
      ...Object.values(record?.labels || {}),
      ...labelKeys.map((key) => record?.identity?.[key]),
    ];
    return values.some((value) => normalizedDisplayName(value) === expected);
  });
}

export function identityRecordsMatchPeer(records, peerID) {
  const expected = String(peerID || "").trim();
  if (!expected) return false;
  const peerKeys = ["sec_uid", "secuid", "sec_user_id", "secuserid", "uid", "user_id", "userid"];
  return (records || []).some((record) => peerKeys
    .some((key) => String(record?.identity?.[key] || "").trim() === expected));
}

export function isMutualFriendRelationship(relationship) {
  const followStatus = String(relationship?.follow_status ?? "").trim();
  const followerStatus = String(relationship?.follower_status ?? "").trim();
  if (!followStatus || !followerStatus) return null;
  return followStatus === "2" && followerStatus === "1";
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

export function filterStrangerConversationInventory(entries, strangerConversationIDs) {
  const strangerIDs = strangerConversationIDs instanceof Set
    ? strangerConversationIDs
    : new Set(strangerConversationIDs || []);
  const kept = [];
  const filtered = [];
  for (const entry of entries || []) {
    const conversationID = String(entry?.[1]?.platform_conversation_id || "").trim();
    (conversationID && strangerIDs.has(conversationID) ? filtered : kept).push(entry);
  }
  return { kept, filtered };
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
    if ((existing.streak_activated_today === null || existing.streak_activated_today === undefined)
      && incoming.streak_activated_today !== null && incoming.streak_activated_today !== undefined) {
      merged.streak_activated_today = incoming.streak_activated_today;
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
  if (existing.streak_activated_today !== null && existing.streak_activated_today !== undefined
    && (incoming.streak_activated_today === null || incoming.streak_activated_today === undefined)) {
    merged.streak_activated_today = existing.streak_activated_today;
  }
  return merged;
}

function sameConversationInventoryIdentity(left, right) {
  const leftConversationID = String(left?.platform_conversation_id || "").trim();
  const rightConversationID = String(right?.platform_conversation_id || "").trim();
  if (!leftConversationID || leftConversationID !== rightConversationID) return false;

  const leftType = conversationTypeFromValue(left?.conversation_type);
  const rightType = conversationTypeFromValue(right?.conversation_type);
  if (leftType !== rightType) return false;
  if (leftType !== "direct") return true;

  const leftPeerID = String(left?.peer_platform_user_id || "").trim();
  const rightPeerID = String(right?.peer_platform_user_id || "").trim();
  return Boolean(leftPeerID) && leftPeerID === rightPeerID;
}

export function shouldRejectConversationInventoryReplacement(seen, inventoryKey, existing, incoming) {
  if (!existing || sameConversationInventoryIdentity(existing, incoming)) return false;
  for (const [key, row] of seen?.entries?.() || []) {
    if (key !== inventoryKey && sameConversationInventoryIdentity(row, incoming)) return true;
  }
  return false;
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

export function selectClickedConversationIdentityFromSources(domConversationID, getInfoIDs, participantIDs) {
  const normalized = (values) => [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  const info = normalized(getInfoIDs);
  const participants = normalized(participantIDs);
  if (participants.length) {
    const participantSet = new Set(participants);
    const common = info.filter((id) => participantSet.has(id));
    const commonGroups = common.filter((id) => conversationTypeFromID(id) === "group");
    const participantGroups = participants.filter((id) => conversationTypeFromID(id) === "group");
    const groupID = commonGroups.length === 1
      ? commonGroups[0]
      : (common.length === 1 ? common[0] : (participantGroups.length === 1 ? participantGroups[0] : ""));
    if (groupID) {
      return { conversationID: groupID, conversationType: "group", authoritative: true };
    }
  }
  return selectClickedConversationIdentity(domConversationID, info.map((conversationID) => ({
    conversationID,
    conversationType: conversationTypeFromID(conversationID),
  })));
}
