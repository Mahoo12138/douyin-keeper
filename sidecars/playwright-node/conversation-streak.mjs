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

export function selectConversationStreakDays(interfaceCandidates, domCandidate) {
  const uniqueInterface = [...new Set((interfaceCandidates || [])
    .filter((value) => Number.isSafeInteger(value) && value >= 0 && value <= 10000))];
  if (uniqueInterface.length === 1) return { days: uniqueInterface[0], source: "interface" };
  if (Number.isSafeInteger(domCandidate) && domCandidate >= 0 && domCandidate <= 10000) {
    return { days: domCandidate, source: "dom" };
  }
  return { days: null, source: "missing" };
}

export async function readConversationListStreakDays(page, dataIndex) {
  const index = String(dataIndex ?? "").trim();
  if (!/^\d+$/.test(index)) return null;
  const locator = page.locator(`.conversationConversationListwrapper [data-index="${index}"]`);
  try {
    const count = Math.min(await locator.count(), 4);
    for (let position = count - 1; position >= 0; position -= 1) {
      const anchor = locator.nth(position);
      if (!await anchor.isVisible().catch(() => false)) continue;
      const text = await anchor.evaluate((node) => {
        const scope = node.closest(".conversationConversationItemwrapper")
          || node.querySelector(".conversationConversationItemwrapper")
          || node;
        const exact = scope.querySelector(".commonStreaknormalText");
        if (exact?.textContent?.trim()) return exact.textContent.trim();
        const classFallback = scope.querySelector('[class*="commonStreak"], [class*="streak" i], [class*="flame" i]');
        if (classFallback?.textContent?.trim()) return classFallback.textContent.trim();
        const semantic = [...scope.querySelectorAll("span,div,p")]
          .map((item) => (item.textContent || "").replace(/\s+/g, " ").trim())
          .find((value) => value.length <= 80 && /(?:火花|连续聊天|streak|flame|🔥)/i.test(value) && /\d/.test(value));
        return semantic || "";
      });
      return parseConversationStreakText(text);
    }
  } catch {
    return null;
  }
  return null;
}
