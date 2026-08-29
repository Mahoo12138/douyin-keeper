export const CHAT_URL = "https://www.douyin.com/chat?isPopup=1";
export const CONVERSATION_LIST_SELECTOR = ".conversationConversationListwrapper";

// The chat route lazy-mounts its virtual list. Waiting for the exact list
// keeps callers from treating the surrounding chat-history pane as ready.
export async function waitForConversationList(page, timeout = 12000) {
  try {
    const lists = page.locator(`${CONVERSATION_LIST_SELECTOR}:visible`);
    await lists.first().waitFor({ state: "visible", timeout });
    return await lists.count() === 1;
  } catch {
    return false;
  }
}
