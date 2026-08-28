export async function clickConversationListRowByIndex(page, dataIndex) {
  const index = String(dataIndex || "").trim();
  if (!/^\d+$/.test(index)) return false;
  const locator = page.locator(`.conversationConversationListwrapper [data-index="${index}"]`);
  try {
    const count = Math.min(await locator.count(), 4);
    for (let position = count - 1; position >= 0; position -= 1) {
      const row = locator.nth(position);
      if (!await row.isVisible().catch(() => false)) continue;
      await row.click({ timeout: 5000, force: true });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function describeConversationListRowByIndex(page, dataIndex) {
  const index = String(dataIndex || "").trim();
  if (!/^\d+$/.test(index)) return { target_found: false, reason: "invalid_data_index" };
  const locator = page.locator(`.conversationConversationListwrapper [data-index="${index}"]`);
  try {
    const count = Math.min(await locator.count(), 4);
    let visibleCount = 0;
    for (let position = count - 1; position >= 0; position -= 1) {
      const candidate = locator.nth(position);
      if (!await candidate.isVisible().catch(() => false)) continue;
      visibleCount += 1;
      const details = await candidate.evaluate((node) => {
        const list = node.closest(".conversationConversationListwrapper");
        const row = node.closest(".conversationConversationItemwrapper")
          || node.querySelector(".conversationConversationItemwrapper")
          || node;
        const title = row.querySelector(".conversationConversationItemtitle")?.textContent || "";
        const rect = row.getBoundingClientRect();
        const listRect = list?.getBoundingClientRect();
        const rounded = (value) => Math.round(Number(value) || 0);
        return {
          title: title.replace(/\s+/g, " ").trim().slice(0, 128),
          row_rect: { left: rounded(rect.left), top: rounded(rect.top), width: rounded(rect.width), height: rounded(rect.height) },
          list_rect: listRect ? { left: rounded(listRect.left), top: rounded(listRect.top), width: rounded(listRect.width), height: rounded(listRect.height) } : null,
          inside_list: Boolean(list && list.contains(row)),
          row_class: typeof row.className === "string" ? row.className.slice(0, 160) : "",
        };
      });
      return {
        target_found: true,
        selector_match_count: count,
        visible_match_count: visibleCount,
        selected_position: position,
        ...details,
      };
    }
    return { target_found: false, reason: "no_visible_match", selector_match_count: count, visible_match_count: visibleCount };
  } catch (error) {
    return { target_found: false, reason: "inspection_failed", error_name: String(error?.name || "Error") };
  }
}
