export function canCommitFriendSync({ responseSeen = false, friendCount = 0, complete = false } = {}) {
  return Boolean(responseSeen && friendCount > 0 && complete);
}
