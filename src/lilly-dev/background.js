// The development shell opens a panel only after a toolbar click.
// No page inspection, storage, model transport or agent execution.
chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab.windowId) || tab.windowId < 0) return;
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    console.warn("LillyBrowser: unable to open development panel");
  });
});
