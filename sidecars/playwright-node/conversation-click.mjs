import { scrollConversationListDOM } from "./conversation-scroll.mjs";

let conversationClickMarkerSequence = 0;

export async function clickConversationListRowByIndex(page, dataIndex) {
  const index = String(dataIndex || "").trim();
  if (!/^\d+$/.test(index)) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const locator = page.locator(`.conversationConversationListwrapper [data-index="${index}"]`);
    try {
      const count = Math.min(await locator.count(), 4);
      for (let position = count - 1; position >= 0; position -= 1) {
        const row = locator.nth(position);
        if (!await row.isVisible().catch(() => false)) continue;
        await row.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await row.click({ timeout: 5000, force: true });
        return true;
      }
    } catch {}
    await page.waitForTimeout(120);
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
        const canonicalKey = (value) => String(value ?? "")
          .replace(/(?:&#x20;|&#32;|&nbsp;|\u00a0)+$/gi, "")
          .trim();
        const componentKey = (nodes) => {
          for (const candidateNode of nodes) {
            for (const property of Object.keys(candidateNode || {}).filter((key) => /^__reactFiber/.test(key))) {
              let fiber = candidateNode[property];
              for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
                const key = canonicalKey(fiber.key);
                if (/^\d+(?::\d+){2,}$/.test(key) || /^\d{10,30}$/.test(key)) return key;
              }
            }
          }
          return "";
        };
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
          platform_component_key: componentKey([row, node, ...row.querySelectorAll("*")]),
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

export async function clickConversationListRowByIdentity(page, conversationID, peerID = "") {
  const wantedConversation = String(conversationID || "").trim();
  const wantedPeer = String(peerID || "").trim();
  if (!wantedConversation) return false;

  await page.evaluate(scrollConversationListDOM, "top").catch(() => null);
  await page.waitForTimeout(120);
  for (let round = 0; round < 120; round += 1) {
    const marker = `dk-conversation-${Date.now()}-${++conversationClickMarkerSequence}`;
    const matched = await page.evaluate(({ conversationID: expectedConversation, peerID: expectedPeer, marker: clickMarker }) => {
      const canonicalKey = (value) => String(value ?? "")
        .replace(/(?:&#x20;|&#32;|&nbsp;|\u00a0)+$/gi, "")
        .trim();
      const reactKey = (node) => {
        const candidates = [node, ...node.querySelectorAll("*")];
        let parent = node.parentElement;
        for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) candidates.push(parent);
        for (const candidate of candidates) {
          for (const property of Object.keys(candidate || {}).filter((key) => /^__reactFiber/.test(key))) {
            let fiber = candidate[property];
            for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
              const key = canonicalKey(fiber.key);
              if (/^\d+(?::\d+){2,}$/.test(key) || /^\d{10,30}$/.test(key)) return key;
            }
          }
        }
        return "";
      };
      const list = [...document.querySelectorAll(".conversationConversationListwrapper")].find((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      if (!list) return false;
      const nodes = [...list.querySelectorAll(".conversationConversationItemwrapper")];
      const node = nodes.find((item) => {
        const conversation = canonicalKey(item.getAttribute("data-conversation-id")
          || item.getAttribute("data-conversationid")
          || item.getAttribute("data-id")
          || reactKey(item));
        const peer = String(item.getAttribute("data-user-id") || item.getAttribute("data-uid") || "").trim();
        return conversation === expectedConversation || (expectedPeer && peer === expectedPeer);
      });
      if (!node) return false;
      node.setAttribute("data-dk-conversation-click", clickMarker);
      return true;
    }, { conversationID: wantedConversation, peerID: wantedPeer, marker });
    if (matched) {
      const row = page.locator(`.conversationConversationListwrapper [data-dk-conversation-click="${marker}"]`);
      try {
        if (await row.count()) {
          await row.first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          await row.first().click({ timeout: 5000, force: true });
          await page.waitForTimeout(120);
          return true;
        }
      } catch {
        // The virtual list may recycle the marked row; resume scanning.
      } finally {
        await row.evaluateAll((nodes) => nodes.forEach((node) => node.removeAttribute("data-dk-conversation-click"))).catch(() => {});
      }
    }

    const scroll = await page.evaluate(scrollConversationListDOM, "next").catch(() => null);
    if (!scroll?.target_found || (!scroll.moved && scroll.at_bottom)) return false;
    await page.waitForTimeout(scroll.moved ? 220 : 120);
  }
  return false;
}
