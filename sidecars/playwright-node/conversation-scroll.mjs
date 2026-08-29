export function scrollConversationListDOM(action = "next") {
  const selector = ".conversationConversationListwrapper";
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const numericIndices = (root) => [...root.querySelectorAll("[data-index]")]
    .map((node) => Number.parseInt(String(node.getAttribute("data-index") || ""), 10))
    .filter(Number.isFinite);
  const matches = [...document.querySelectorAll(selector)];
  const visibleMatches = matches.filter(visible);
  if (visibleMatches.length !== 1) {
    return {
      moved: false,
      at_bottom: false,
      target_found: false,
      position_verified: false,
      reason: visibleMatches.length ? "conversation_list_selector_ambiguous" : "conversation_list_selector_not_found",
      selector,
      selector_match_count: matches.length,
      visible_match_count: visibleMatches.length,
    };
  }

  const target = visibleMatches[0];
  const rect = target.getBoundingClientRect();
  const viewportWidth = innerWidth || document.documentElement.clientWidth;
  const viewportHeight = innerHeight || document.documentElement.clientHeight;
  const rowCount = target.querySelectorAll(".conversationConversationItemwrapper").length;
  const anchorIndices = numericIndices(target);
  const targetRect = {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
  const positionVerified = target.classList.contains("conversationConversationListwrapper")
    && targetRect.left >= -1
    && targetRect.top >= -1
    && targetRect.right <= viewportWidth + 1
    && targetRect.bottom <= viewportHeight + 1
    && rowCount > 0;
  if (!positionVerified) {
    return {
      moved: false,
      at_bottom: false,
      target_found: false,
      position_verified: false,
      reason: "conversation_list_position_check_failed",
      selector,
      selector_match_count: matches.length,
      visible_match_count: visibleMatches.length,
      target_rect: targetRect,
      row_count: rowCount,
      anchor_indices: anchorIndices.slice(0, 40),
    };
  }

  const before = target.scrollTop;
  const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
  const step = Math.max(320, Math.floor(target.clientHeight * 0.85));
  const next = action === "top" ? 0 : Math.min(maxScrollTop, before + step);
  target.scrollTop = next;
  target.dispatchEvent(new Event("scroll", { bubbles: true }));
  return {
    moved: target.scrollTop !== before,
    at_bottom: target.scrollTop >= maxScrollTop - 8,
    target_found: true,
    position_verified: true,
    reason: action === "top" ? "exact_conversation_list_reset" : "exact_conversation_list_selected",
    selector,
    selector_match_count: matches.length,
    visible_match_count: visibleMatches.length,
    target_class: typeof target.className === "string" ? target.className.slice(0, 240) : "",
    target_role: target.getAttribute("role") || "",
    target_rect: targetRect,
    target_is_list_wrapper: true,
    row_count: rowCount,
    anchor_count: anchorIndices.length,
    anchor_indices: anchorIndices.slice(0, 40),
    before,
    after: target.scrollTop,
    scroll_height: target.scrollHeight,
    client_height: target.clientHeight,
  };
}
