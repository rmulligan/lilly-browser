// Toolbar invocation opens the panel; it does not invite or inspect.
chrome.action.onClicked.addListener(tab => {
  if (!Number.isSafeInteger(tab.windowId) || tab.windowId < 0 || tab.incognito !== false) return;
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});
