// Create context menu on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convert-to-markdown",
    title: "Copy page as Markdown",
    contexts: ["page", "selection"],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "convert-to-markdown" && tab?.id) {
    await executeConversion(tab);
  }
});

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) {
    await executeConversion(tab);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "convert-current-tab") {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) {
          throw new Error("No active tab");
        }
        await executeConversion(activeTab);
        sendResponse({ ok: true });
      } catch (error) {
        console.error("Failed to convert current tab:", error);
        sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  }
  return undefined;
});

// Execute the conversion
async function executeConversion(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.windowId) return;
  
  try {
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
  } catch (error) {
    console.error("Failed to execute conversion:", error);
  }
}

// Optional: Add keyboard shortcut support
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "convert-to-markdown") {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      await executeConversion(activeTab);
    }
  }
});
