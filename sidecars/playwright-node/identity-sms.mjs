const SMS_ACTION_TEXTS = ["接收短信验证码", "发送短信验证码", "发送验证码"];
const SMS_SELECTION_ACTION_TEXTS = new Set(["接收短信验证码", "发送短信验证码"]);
const SMS_SENT_TEXTS = ["短信已发送至", "验证码已发送至", "短信验证码已发送", "后重新发送"];
const IDENTITY_CONTEXT_TEXTS = ["身份验证", "以确保为本人操作", "为保障账号安全"];
const CHALLENGE_TEXTS = ["安全验证", "滑动验证", "人机验证", "身份验证", ...SMS_ACTION_TEXTS, "以确保为本人操作", "为保障账号安全"];
const SMS_CODE_SELECTORS = [
  "input[autocomplete='one-time-code']",
  "input[placeholder*='短信验证码']",
  "input[placeholder*='验证码']",
  "input[name='code']",
  "input[name='sms_code']",
  "input[inputmode='numeric']",
];

async function firstVisibleInPage(page, selectors, { preferLast = false } = {}) {
  if (!page || page.isClosed()) return null;
  for (const [frameIndex, frame] of page.frames().entries()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector);
      const count = Math.min(await locator.count().catch(() => 0), 8);
      const indexes = Array.from({ length: count }, (_, index) => index);
      if (preferLast) indexes.reverse();
      for (const index of indexes) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return { page, frame, frameIndex, locator: candidate };
        }
      }
    }
  }
  return null;
}

async function visibleBodyText(page) {
  if (!page || page.isClosed()) return "";
  const parts = [];
  for (const frame of page.frames()) {
    const text = await frame.locator("body").innerText({ timeout: 500 }).catch(() => "");
    if (text) parts.push(text);
  }
  return parts.join("\n");
}

async function hasVisibleText(page, text) {
  if (!page || page.isClosed()) return false;
  for (const frame of page.frames()) {
    const matches = frame.getByText(text, { exact: true });
    const count = Math.min(await matches.count().catch(() => 0), 12);
    for (let index = 0; index < count; index += 1) {
      if (await matches.nth(index).isVisible().catch(() => false)) return true;
    }
  }
  return false;
}

function candidatePages(item) {
  const pages = item?.context?.pages?.() || [];
  const ordered = [...pages].filter((page) => !page.isClosed()).reverse();
  if (item?.page && !item.page.isClosed() && !ordered.includes(item.page)) ordered.push(item.page);
  return ordered;
}

export function latestLoginPage(item) {
  return candidatePages(item)[0] || null;
}

export async function findSMSCodePage(item) {
  for (const page of candidatePages(item)) {
    const text = await visibleBodyText(page);
    if (!SMS_SENT_TEXTS.some((value) => text.includes(value))) continue;
    const input = await firstVisibleInPage(page, SMS_CODE_SELECTORS, { preferLast: true });
    if (input) return input;
  }
  for (const page of candidatePages(item)) {
    const input = await firstVisibleInPage(page, SMS_CODE_SELECTORS);
    if (input) return input;
  }
  return null;
}

export async function fillSMSCodeInput(inputBox, code) {
  const oneDigitInputs = inputBox.frame.locator("input[maxlength='1']");
  const visibleInputs = [];
  const count = Math.min(await oneDigitInputs.count().catch(() => 0), 8);
  for (let index = 0; index < count; index += 1) {
    const locator = oneDigitInputs.nth(index);
    if (await locator.isVisible().catch(() => false)) visibleInputs.push(locator);
  }
  if (visibleInputs.length >= 4 && visibleInputs.length <= 8 && code.length >= visibleInputs.length) {
    for (let index = 0; index < visibleInputs.length; index += 1) {
      await visibleInputs[index].fill(code[index]);
    }
    return "otp";
  }
  await inputBox.locator.fill(code);
  return "single";
}

async function clickSMSAction(page) {
  for (const frame of page.frames()) {
    for (const actionText of SMS_ACTION_TEXTS) {
      for (const exact of [true, false]) {
        const matches = frame.getByText(actionText, { exact });
        const count = Math.min(await matches.count().catch(() => 0), 12);
        const candidates = [];
        for (let index = 0; index < count; index += 1) {
          const locator = matches.nth(index);
          if (!await locator.isVisible().catch(() => false)) continue;
          const box = await locator.boundingBox().catch(() => null);
          candidates.push({ locator, area: box ? box.width * box.height : Number.MAX_SAFE_INTEGER });
        }
        candidates.sort((left, right) => left.area - right.area);
        for (const candidate of candidates) {
          let clickTarget = candidate.locator;
          const maxAttempts = SMS_SELECTION_ACTION_TEXTS.has(actionText) ? 4 : 1;
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const tagName = await clickTarget.evaluate((element) => element.tagName).catch(() => "");
            if (tagName === "BODY" || tagName === "HTML") break;
            try {
              await clickTarget.click({ timeout: 2_500, force: true });
              if (!SMS_SELECTION_ACTION_TEXTS.has(actionText)) {
                return { clicked: true, actionText };
              }
              await page.waitForTimeout(250);
              if (!await hasVisibleText(page, actionText)) {
                return { clicked: true, actionText };
              }
            } catch {
              // Try the enclosing card when a nested text node cannot activate
              // Douyin's verification option.
            }
            clickTarget = clickTarget.locator("..");
          }
          return { clicked: true, actionText };
        }
      }
    }
  }
  return { clicked: false, actionText: "" };
}

export async function prepareQRIdentitySMS(item, { timeoutMs = 5_000, allowClick = true, requestPending = false } = {}) {
  const pages = candidatePages(item);

  let challengePage = null;
  let identityPage = null;
  let actionPage = null;
  for (const page of pages) {
    const text = await visibleBodyText(page);
    if (!challengePage && CHALLENGE_TEXTS.some((value) => text.includes(value))) challengePage = page;
    if (!identityPage && IDENTITY_CONTEXT_TEXTS.some((value) => text.includes(value))) identityPage = page;
    if (!actionPage && SMS_ACTION_TEXTS.some((value) => text.includes(value))) actionPage = page;
  }
  const verificationPage = identityPage || (requestPending ? item?.page : null);
  let selectionActionVisible = false;
  if (actionPage) {
    for (const actionText of SMS_SELECTION_ACTION_TEXTS) {
      if (await hasVisibleText(actionPage, actionText)) {
        selectionActionVisible = true;
        break;
      }
    }
  }
  const verificationText = verificationPage ? await visibleBodyText(verificationPage) : "";
  const sentConfirmationVisible = SMS_SENT_TEXTS.some((text) => verificationText.includes(text));
  const existingInput = verificationPage
    && (sentConfirmationVisible || (!selectionActionVisible && (!actionPage || requestPending)))
    ? await firstVisibleInPage(verificationPage, SMS_CODE_SELECTORS, { preferLast: sentConfirmationVisible })
    : null;
  if (existingInput) return { state: "sms_code_required", page: existingInput.page, clicked: false };
  if (!challengePage) {
    return requestPending
      ? { state: "sms_request_pending", page: item?.page || pages[0] || null, clicked: false }
      : { state: "none", page: item?.page || pages[0] || null, clicked: false };
  }
  if (!allowClick) {
    return requestPending
      ? { state: "sms_request_pending", page: actionPage || challengePage, clicked: false }
      : { state: "challenge_required", page: challengePage, clicked: false };
  }
  if (!actionPage) return { state: "challenge_required", page: challengePage, clicked: false };

  const action = await clickSMSAction(actionPage);
  if (!action.clicked) return { state: "challenge_required", page: actionPage, clicked: false };

  const deadline = Date.now() + Math.max(0, timeoutMs);
  do {
    const selectionStillVisible = SMS_SELECTION_ACTION_TEXTS.has(action.actionText)
      && await hasVisibleText(actionPage, action.actionText);
    const actionPageText = await visibleBodyText(actionPage);
    const sentConfirmation = SMS_SENT_TEXTS.some((text) => actionPageText.includes(text));
    if (!selectionStillVisible || sentConfirmation) {
      const input = await firstVisibleInPage(actionPage, SMS_CODE_SELECTORS, { preferLast: sentConfirmation });
      if (input) return { state: "sms_code_required", page: input.page, clicked: true, actionText: action.actionText };
    }
    if (Date.now() >= deadline) break;
    await actionPage.waitForTimeout(100);
  } while (true);
  return { state: "sms_request_pending", page: actionPage, clicked: true, actionText: action.actionText };
}

export async function isQRIdentitySMSVisible(item) {
  if (await findSMSCodePage(item)) return true;
  for (const page of candidatePages(item)) {
    const text = await visibleBodyText(page);
    if (SMS_ACTION_TEXTS.some((value) => text.includes(value))) return true;
  }
  return false;
}
