function sendError(code, message, detail) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  return error;
}

async function editorText(editor) {
  try {
    return await editor.inputValue();
  } catch {
    return editor.innerText().catch(() => "");
  }
}

async function visibleMessageSnapshot(page, text) {
  return page.evaluate((wanted) => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const target = normalize(wanted);
    const selectors = [
      ".TextMessageTextpureText",
      "[data-message-id]",
      "[data-msg-id]",
      "[data-messageid]",
    ];
    const nodes = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))];
    const matches = nodes.filter((node) => {
      if (node.closest("[contenteditable='true'], textarea, input")) return false;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      return normalize(node.textContent) === target;
    });
    let platformMessageID = "";
    for (const match of matches.toReversed()) {
      for (let node = match, depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        platformMessageID = node.getAttribute?.("data-message-id")
          || node.getAttribute?.("data-msg-id")
          || node.getAttribute?.("data-messageid")
          || "";
        if (platformMessageID) break;
      }
      if (platformMessageID) break;
    }
    return { count: matches.length, platform_message_id: platformMessageID };
  }, text);
}

export async function sendTextAndConfirm(page, editor, text) {
  const before = await visibleMessageSnapshot(page, text);
  await editor.click();
  try {
    await editor.press("Control+A");
    await editor.press("Backspace");
    await editor.type(text, { delay: 20 });
  } catch {
    await editor.fill(text).catch(() => null);
  }
  if (!(await editorText(editor)).includes(text)) {
    throw sendError("BROWSER_SELECTOR_CHANGED", "message text was not entered", { outcome: "not_submitted" });
  }
  try {
    await editor.press("Enter");
  } catch {
    await page.keyboard.press("Enter");
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(500);
    const current = await visibleMessageSnapshot(page, text);
    if (current.count > before.count) {
      return {
        confirmed: true,
        platform_message_id: current.platform_message_id,
        confirmation_source: current.platform_message_id ? "browser_message_id" : "browser_visible_message",
      };
    }
  }
  if ((await editorText(editor)).includes(text)) {
    throw sendError("BROWSER_SELECTOR_CHANGED", "message submit action was unavailable", { outcome: "not_submitted" });
  }
  throw sendError("ADAPTER_INCOMPATIBLE", "message send was not confirmed", { outcome: "unknown" });
}
