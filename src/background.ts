chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.convertPageToMarkdown && window.convertPageToMarkdown();
      },
    });
  }
});
