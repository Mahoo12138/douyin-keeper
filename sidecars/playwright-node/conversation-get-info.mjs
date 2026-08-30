const GET_INFO_RECORD_PATH = [6, 610, 1];

export function canonicalConversationComponentKey(value) {
  return String(value ?? "")
    .replace(/(?:&#x20;|&#32;|&nbsp;|\u00a0)+$/gi, "")
    .trim();
}

export function isConversationComponentKey(value) {
  const key = canonicalConversationComponentKey(value);
  return /^\d+(?::\d+){2,}$/.test(key) || /^\d{10,30}$/.test(key);
}

function decodedFieldValues(container, fieldNumber) {
  if (!Array.isArray(container)) return [];
  return container
    .filter((item) => item?.field === fieldNumber)
    .map((item) => {
      if (item.kind === "message") return item.fields || [];
      if (item.kind === "string") return item.text;
      if (item.kind === "varint") return item.value;
      return undefined;
    })
    .filter((value) => value !== undefined);
}

function objectFieldValues(container, fieldNumber) {
  if (!container || typeof container !== "object" || Array.isArray(container)) return [];
  const value = container[String(fieldNumber)];
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function fieldValues(container, fieldNumber) {
  return Array.isArray(container)
    ? decodedFieldValues(container, fieldNumber)
    : objectFieldValues(container, fieldNumber);
}

function messagesAtPath(root, path) {
  let values = [root];
  for (const fieldNumber of path) {
    values = values.flatMap((value) => fieldValues(value, fieldNumber))
      .filter((value) => value && typeof value === "object");
  }
  return values;
}

function firstScalar(container, fieldNumber) {
  const value = fieldValues(container, fieldNumber)
    .find((candidate) => candidate !== null && candidate !== undefined && typeof candidate !== "object");
  return value === undefined ? "" : String(value).trim();
}

function conversationType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "direct", "single"].includes(normalized)) return "direct";
  if (["2", "group", "multi"].includes(normalized)) return "group";
  return "unknown";
}

function safeDisplayValue(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && text !== "0x" ? text : "";
}

function conversationAttributes(info) {
  const attributes = new Map();
  for (const pair of fieldValues(info, 11)) {
    if (!pair || typeof pair !== "object") continue;
    const key = firstScalar(pair, 1);
    if (key) attributes.set(key, firstScalar(pair, 2));
  }
  return attributes;
}

function boundedDays(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 0 && days <= 10000 ? days : null;
}

export function parseGetInfoStreak(attributes) {
  const data = attributes?.get?.("a:consecutive_chat_data");
  if (data) {
    try {
      const parsed = JSON.parse(data);
      const flames = Array.isArray(parsed?.flame_infos) ? parsed.flame_infos : [];
      const current = flames.find((item) => Number(item?.state) === 1) || flames[0] || null;
      const days = boundedDays(current?.real_days)
        ?? boundedDays(current?.days)
        ?? boundedDays(parsed?.consecutive_count_info?.consecutive_count);
      const states = flames.map((item) => Number(item?.state)).filter(Number.isFinite);
      const activatedToday = states.includes(1) ? true : (states.length ? false : null);
      return { days, activatedToday, source: "a:consecutive_chat_data" };
    } catch {}
  }

  const compact = String(attributes?.get?.("a:consecutive_chat") || "").trim();
  const days = boundedDays(compact.split(":", 1)[0]);
  return { days, activatedToday: null, source: days === null ? "missing" : "a:consecutive_chat" };
}

// The decoded fixtures show one Conversation record at 6.610.1. Its field 1
// is the same stable key exposed by the clicked React Fiber. Field 50 carries
// presentation metadata and the conversation attribute map.
export function extractGetInfoListConversations(decodedOrObject) {
  const root = decodedOrObject?.ok === true ? decodedOrObject.fields : decodedOrObject;
  if (!root || typeof root !== "object") return [];

  const records = [];
  for (const record of messagesAtPath(root, GET_INFO_RECORD_PATH)) {
    const componentKey = canonicalConversationComponentKey(firstScalar(record, 1));
    if (!isConversationComponentKey(componentKey)) continue;
    const info = fieldValues(record, 50).find((value) => value && typeof value === "object") || null;
    const responseConversationID = canonicalConversationComponentKey(firstScalar(info, 1)) || componentKey;
    if (responseConversationID !== componentKey) continue;
    const type = conversationType(firstScalar(record, 3) || firstScalar(info, 3));
    const attributes = conversationAttributes(info);
    const streak = parseGetInfoStreak(attributes);
    const avatarURL = safeDisplayValue(firstScalar(info, 7));
    records.push({
      componentKey,
      platformConversationID: responseConversationID,
      conversationType: type,
      peerPlatformUserID: type === "direct" ? safeDisplayValue(firstScalar(info, 13)) : "",
      peerNumericUserID: type === "direct" ? safeDisplayValue(firstScalar(info, 12)) : "",
      displayName: safeDisplayValue(firstScalar(info, 5)),
      avatarURL: /^https?:\/\//i.test(avatarURL) ? avatarURL : "",
      streakDays: streak.days,
      streakActivatedToday: streak.activatedToday,
      streakSource: streak.source,
    });
  }
  return records;
}

export function selectGetInfoConversationForComponentKey(responses, componentKey) {
  const expected = canonicalConversationComponentKey(componentKey);
  if (!isConversationComponentKey(expected)) return null;
  const candidates = (responses || [])
    .filter((response) => /\/v2\/conversation\/get_info_list(?:\/|$)/i.test(response?.path || ""))
    .flatMap((response) => extractGetInfoListConversations(response?.decoded))
    .filter((candidate) => candidate.componentKey === expected);
  if (!candidates.length) return null;

  const types = [...new Set(candidates.map((candidate) => candidate.conversationType).filter((type) => type !== "unknown"))];
  if (types.length > 1) return null;
  const unique = (field) => [...new Set(candidates.map((candidate) => candidate[field]).filter((value) => value !== "" && value !== null && value !== undefined))];
  const streakDays = unique("streakDays");
  const streakActivatedToday = unique("streakActivatedToday");
  if (streakDays.length > 1 || streakActivatedToday.length > 1) return null;

  return {
    componentKey: expected,
    platformConversationID: expected,
    conversationType: types[0] || "unknown",
    peerPlatformUserID: unique("peerPlatformUserID")[0] || "",
    peerNumericUserID: unique("peerNumericUserID")[0] || "",
    displayName: unique("displayName")[0] || "",
    avatarURL: unique("avatarURL")[0] || "",
    streakDays: streakDays[0] ?? null,
    streakActivatedToday: streakActivatedToday[0] ?? null,
    responseCount: candidates.length,
    streakSource: unique("streakSource")[0] || "missing",
  };
}
