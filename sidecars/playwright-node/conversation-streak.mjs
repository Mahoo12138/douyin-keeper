const STREAK_FIELD = /^(?:streak|spark|flame|fire|continuous_chat|chat_streak)_?(?:day|days|count)$/i;

function normalizedFieldName(value) {
  return String(value || "").trim().replaceAll("-", "_");
}

export function parseConversationStreakText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return null;
  const match = text.match(/(?:^|\D)(\d{1,5})(?:\D|$)/);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isSafeInteger(days) && days >= 0 && days <= 10000 ? days : null;
}

export function collectJSONStreakCandidates(value, depth = 0, output = []) {
  if (depth > 8 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 200)) collectJSONStreakCandidates(item, depth + 1, output);
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (STREAK_FIELD.test(normalizedFieldName(key))) {
      const days = parseConversationStreakText(child);
      if (days !== null) output.push(days);
    }
    collectJSONStreakCandidates(child, depth + 1, output);
  }
  return output;
}

export function selectConversationStreakDays(interfaceCandidates, domCandidate, options = {}) {
  const uniqueInterface = [...new Set((interfaceCandidates || [])
    .filter((value) => Number.isSafeInteger(value) && value >= 0 && value <= 10000))];
  if (options.preferInterface === true && options.interfaceScoped !== false && uniqueInterface.length === 1) {
    return { days: uniqueInterface[0], source: "interface" };
  }
  if (Number.isSafeInteger(domCandidate) && domCandidate >= 0 && domCandidate <= 10000) {
    return { days: domCandidate, source: "dom" };
  }
  if (options.interfaceScoped !== false && uniqueInterface.length === 1) {
    return { days: uniqueInterface[0], source: "interface" };
  }
  return { days: null, source: "missing" };
}

export function classifyConversationStreakIconSource(value) {
  let source = String(value || "").trim().toLowerCase();
  try { source = decodeURIComponent(source); } catch {}
  if (!source) return { activatedToday: null, kind: "missing" };
  if (source.includes("gray")) return { activatedToday: false, kind: "gray" };
  if (source.includes("/flame_icon/couple/normal_couple.png")) {
    return { activatedToday: true, kind: "couple" };
  }
  if (source.includes("/flame_icon/normal/normal_normal.png")) {
    return { activatedToday: true, kind: "normal" };
  }
  return { activatedToday: null, kind: "unknown" };
}

export async function readConversationListStreakSnapshot(page, dataIndex) {
  const index = String(dataIndex ?? "").trim();
  if (!/^\d+$/.test(index)) return null;
  const locator = page.locator(`.conversationConversationListwrapper [data-index="${index}"]`);
  try {
    const count = Math.min(await locator.count(), 4);
    for (let position = count - 1; position >= 0; position -= 1) {
      const anchor = locator.nth(position);
      if (!await anchor.isVisible().catch(() => false)) continue;
      const snapshot = await anchor.evaluate((node) => {
        const stranger = node.closest(".conversationStrangerBoxwrapper")
          || node.querySelector(".conversationStrangerBoxwrapper");
        const scope = node.closest(".conversationConversationItemwrapper")
          || node.querySelector(".conversationConversationItemwrapper");
        if (stranger || !scope) return { normalConversation: false, text: "", iconSource: "" };
        const exact = scope.querySelector(".commonStreaknormalText");
        let streakText = exact?.textContent?.trim() || "";
        const classFallback = scope.querySelector('[class*="commonStreak"], [class*="streak" i], [class*="flame" i]');
        if (!streakText && classFallback?.textContent?.trim()) streakText = classFallback.textContent.trim();
        if (!streakText) {
          streakText = [...scope.querySelectorAll("span,div,p")]
            .map((item) => (item.textContent || "").replace(/\s+/g, " ").trim())
            .find((value) => value.length <= 80 && /(?:火花|连续聊天|streak|flame|🔥)/i.test(value) && /\d/.test(value)) || "";
        }
        const icon = scope.querySelector("img.commonStreakicon");
        return {
          normalConversation: true,
          text: streakText,
          iconSource: icon?.currentSrc || icon?.getAttribute("src") || "",
        };
      });
      if (!snapshot.normalConversation) continue;
      const icon = classifyConversationStreakIconSource(snapshot.iconSource);
      return {
        days: parseConversationStreakText(snapshot.text) ?? 0,
        activated_today: icon.activatedToday,
        icon_kind: icon.kind,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function readConversationListStreakDays(page, dataIndex) {
  const snapshot = await readConversationListStreakSnapshot(page, dataIndex);
  return snapshot?.days ?? null;
}
