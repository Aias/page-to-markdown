chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id && tab.windowId) {
    // Focus the window first
    await chrome.windows.update(tab.windowId, { focused: true });
    // Make sure the tab is active
    await chrome.tabs.update(tab.id, { active: true });
    // A short delay can sometimes help ensure the focus state
    await new Promise((r) => setTimeout(r, 100));

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.convertPageToMarkdown && window.convertPageToMarkdown();
      },
    });
  }
});
