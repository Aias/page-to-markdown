/**
 * Registers the context menu entry used to trigger Markdown conversion.
 * @listens chrome.runtime#onInstalled
 */
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'convert-to-markdown',
		title: 'Copy page as Markdown',
		contexts: ['page', 'selection'],
	});
});

/**
 * Handles context menu activations for the convert-to-markdown action.
 * @listens chrome.contextMenus#onClicked
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === 'convert-to-markdown' && tab?.id) {
		try {
			await executeConversion(tab);
		} catch (error) {
			console.error('Failed to execute conversion:', error);
		}
	}
});

/**
 * Converts the active tab when the extension toolbar icon is clicked.
 * @listens chrome.action#onClicked
 */
chrome.action.onClicked.addListener(async (tab) => {
	if (tab?.id) {
		try {
			await executeConversion(tab);
		} catch (error) {
			console.error('Failed to execute conversion:', error);
		}
	}
});

/**
 * Responds to messages requesting conversion of the current active tab.
 * @listens chrome.runtime#onMessage
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type === 'convert-current-tab') {
		(async () => {
			try {
				const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (!activeTab) {
					throw new Error('No active tab');
				}
				await executeConversion(activeTab);
				sendResponse({ ok: true });
			} catch (error) {
				console.error('Failed to convert current tab:', error);
				sendResponse({
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				});
			}
		})();
		return true;
	}
	return undefined;
});

/**
 * Focuses the provided tab and injects the conversion script.
 * @param tab - The tab that should run the Markdown conversion.
 */
async function executeConversion(tab: chrome.tabs.Tab) {
	if (tab.id === undefined || tab.windowId === undefined) {
		throw new Error('No active tab');
	}

	await chrome.windows.update(tab.windowId, { focused: true });
	await chrome.tabs.update(tab.id, { active: true });

	await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: async () => {
			if (!window.convertPageToMarkdown) {
				throw new Error('Content script not loaded');
			}
			await window.convertPageToMarkdown();
		},
	});
}

/**
 * Invokes conversion when the user presses the registered keyboard shortcut.
 * @listens chrome.commands#onCommand
 */
chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'convert-to-markdown') {
		const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (activeTab) {
			try {
				await executeConversion(activeTab);
			} catch (error) {
				console.error('Failed to execute conversion:', error);
			}
		}
	}
});

export {};
