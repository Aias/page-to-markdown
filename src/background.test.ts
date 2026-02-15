import { beforeEach, describe, expect, it, vi } from 'vitest';

type MessagePayload = { type?: string };
type MessageSenderPayload = Record<string, never>;
type ResponsePayload = { ok: boolean; message?: string };
type RuntimeMessageListener = (
	message: MessagePayload,
	sender: MessageSenderPayload,
	sendResponse: (response: ResponsePayload) => void
) => boolean | undefined;
type ContextMenuListener = (
	info: { menuItemId: string },
	tab?: { id?: number; windowId?: number }
) => Promise<void> | void;
type ActionListener = (tab: { id?: number; windowId?: number }) => Promise<void> | void;
type CommandListener = (command: string) => Promise<void> | void;
type InstalledListener = () => void;

interface EventHarness<T extends (...args: never[]) => unknown> {
	addListener: ReturnType<typeof vi.fn<(listener: T) => void>>;
	getListener: () => T | undefined;
}

interface ChromeHarness {
	events: {
		onInstalled: EventHarness<InstalledListener>;
		onContextClicked: EventHarness<ContextMenuListener>;
		onActionClicked: EventHarness<ActionListener>;
		onRuntimeMessage: EventHarness<RuntimeMessageListener>;
		onCommand: EventHarness<CommandListener>;
	};
	mocks: {
		createContextMenu: ReturnType<typeof vi.fn>;
		windowsUpdate: ReturnType<typeof vi.fn>;
		tabsUpdate: ReturnType<typeof vi.fn>;
		tabsQuery: ReturnType<typeof vi.fn>;
		executeScript: ReturnType<typeof vi.fn>;
	};
}

function createEvent<T extends (...args: never[]) => unknown>(): EventHarness<T> {
	let listener: T | undefined;

	return {
		addListener: vi.fn((nextListener: T) => {
			listener = nextListener;
		}),
		getListener: () => listener,
	};
}

function setupChromeMock(executeScriptShouldFail: boolean): ChromeHarness {
	const events = {
		onInstalled: createEvent<InstalledListener>(),
		onContextClicked: createEvent<ContextMenuListener>(),
		onActionClicked: createEvent<ActionListener>(),
		onRuntimeMessage: createEvent<RuntimeMessageListener>(),
		onCommand: createEvent<CommandListener>(),
	};

	const mocks = {
		createContextMenu: vi.fn(),
		windowsUpdate: vi.fn(async () => undefined),
		tabsUpdate: vi.fn(async () => undefined),
		tabsQuery: vi.fn(async () => [{ id: 1, windowId: 1 }]),
		executeScript: executeScriptShouldFail
			? vi.fn(async () => {
					throw new Error('injection failed');
				})
			: vi.fn(async () => []),
	};

	Object.defineProperty(globalThis, 'chrome', {
		configurable: true,
		writable: true,
		value: {
			contextMenus: {
				create: mocks.createContextMenu,
				onClicked: events.onContextClicked,
			},
			action: {
				onClicked: events.onActionClicked,
			},
			runtime: {
				onInstalled: events.onInstalled,
				onMessage: events.onRuntimeMessage,
			},
			tabs: {
				query: mocks.tabsQuery,
				update: mocks.tabsUpdate,
			},
			windows: {
				update: mocks.windowsUpdate,
			},
			scripting: {
				executeScript: mocks.executeScript,
			},
			commands: {
				onCommand: events.onCommand,
			},
		},
	});

	return { events, mocks };
}

async function loadBackground() {
	await import('./background');
}

describe('background runtime conversion message', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('responds with ok=true when conversion succeeds', async () => {
		const harness = setupChromeMock(false);
		await loadBackground();

		const listener = harness.events.onRuntimeMessage.getListener();
		if (!listener) {
			throw new Error('Runtime message listener was not registered');
		}

		const sendResponse = vi.fn<(response: ResponsePayload) => void>();
		const result = listener({ type: 'convert-current-tab' }, {}, sendResponse);
		expect(result).toBe(true);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalledWith({ ok: true });
		});

		expect(harness.mocks.executeScript).toHaveBeenCalledTimes(1);
	});

	it('responds with ok=false when conversion fails', async () => {
		const harness = setupChromeMock(true);
		await loadBackground();
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const listener = harness.events.onRuntimeMessage.getListener();
		if (!listener) {
			throw new Error('Runtime message listener was not registered');
		}

		const sendResponse = vi.fn<(response: ResponsePayload) => void>();
		const result = listener({ type: 'convert-current-tab' }, {}, sendResponse);
		expect(result).toBe(true);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalledWith({
				ok: false,
				message: 'injection failed',
			});
		});
		expect(consoleErrorSpy).toHaveBeenCalled();
	});
});
