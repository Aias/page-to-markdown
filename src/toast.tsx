import { StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toast } from '@base-ui-components/react';

type ToastOptions = {
	title: string;
	description?: string;
	type?: string;
	timeout?: number;
};

let toastRoot: Root | null = null;
let containerEl: HTMLElement | null = null;
let enqueue: ((options: ToastOptions) => void) | null = null;
const pendingQueue: ToastOptions[] = [];

/**
 * Attempts to deliver any queued toast notifications once a host is ready.
 */
function flushQueue() {
	if (!enqueue) return;
	while (pendingQueue.length > 0) {
		enqueue(pendingQueue.shift()!);
	}
}

/**
 * Lazily mounts a React root that renders the toast viewport inside the active document.
 */
function ensureHost() {
	if (toastRoot) return;
	containerEl = document.createElement('div');
	containerEl.id = 'page-to-markdown-toast-root';
	containerEl.style.all = 'initial';
	containerEl.style.position = 'fixed';
	containerEl.style.top = '0';
	containerEl.style.left = '0';
	containerEl.style.zIndex = '2147483647';
	containerEl.style.pointerEvents = 'none';
	document.documentElement.appendChild(containerEl);

	toastRoot = createRoot(containerEl);
	toastRoot.render(
		<StrictMode>
			<Toast.Provider timeout={3500} limit={3}>
				<ToastHost />
			</Toast.Provider>
		</StrictMode>
	);
}

/**
 * React component that bridges the Base UI toast manager to the enqueue helper.
 */
function ToastHost() {
	const manager = Toast.useToastManager();
	const { toasts } = manager;

	useEffect(() => {
		enqueue = (options: ToastOptions) => {
			manager.add({
				timeout: options.timeout ?? 4000,
				type: options.type,
				title: options.title,
				description: options.description,
			});
		};
		flushQueue();
		return () => {
			enqueue = null;
		};
	}, [manager]);

	return (
		<Toast.Portal>
			<Toast.Viewport
				style={{
					pointerEvents: 'auto',
					position: 'fixed',
					top: '1.25rem',
					right: '1.25rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.5rem',
					maxWidth: 'min(92vw, 20rem)',
					zIndex: 2147483647,
				}}
			>
				{toasts.map((toast) => (
					<Toast.Root
						key={toast.id}
						toast={toast}
						style={{
							backgroundColor: toast.type === 'error' ? '#fff1f1' : '#ffffff',
							color: toast.type === 'error' ? '#991b1b' : '#0f172a',
							borderRadius: '0.5rem',
							padding: '0.75rem 1rem',
							boxShadow:
								toast.type === 'error'
									? '0 1.125rem 2.5rem -1.25rem rgba(185, 28, 28, 0.35)'
									: '0 1.375rem 3.4375rem -1.375rem rgba(15, 23, 42, 0.28)',
							display: 'flex',
							alignItems: 'flex-start',
							gap: '0.6rem',
							fontFamily:
								"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif",
							border:
								toast.type === 'error'
									? '0.0625rem solid rgba(248, 113, 113, 0.48)'
									: '0.0625rem solid rgba(15, 23, 42, 0.08)',
							backdropFilter: 'blur(1rem)',
						}}
					>
						<div style={{ flex: '1 1 auto' }}>
							{toast.title ? (
								<Toast.Title
									style={{
										fontSize: '0.95rem',
										fontWeight: 600,
										marginBottom: toast.description ? '0.25rem' : 0,
									}}
								>
									{toast.title}
								</Toast.Title>
							) : null}
							{toast.description ? (
								<Toast.Description
									style={{
										fontSize: '0.75rem',
										lineHeight: '1.35',
										opacity: toast.type === 'error' ? 0.9 : 0.7,
									}}
								>
									{toast.description}
								</Toast.Description>
							) : null}
						</div>
						<Toast.Close
							aria-label="Dismiss notification"
							style={{
								border: 'none',
								background: 'transparent',
								color: 'inherit',
								fontSize: '0.85rem',
								fontWeight: 600,
								cursor: 'pointer',
								marginTop: '-0.1rem',
								opacity: 0.5,
							}}
						>
							×
						</Toast.Close>
					</Toast.Root>
				))}
			</Toast.Viewport>
		</Toast.Portal>
	);
}

/**
 * Enqueues a toast, buffering the request if the host has not been initialised yet.
 * @param options - Presentation details for the toast notification.
 */
function enqueueToast(options: ToastOptions) {
	ensureHost();
	if (enqueue) {
		enqueue(options);
	} else {
		pendingQueue.push(options);
		setTimeout(flushQueue, 0);
	}
}

/**
 * Displays a success toast that indicates Markdown was copied.
 * @param description - Optional body text appended to the notification.
 */
export function showSuccessToast(description?: string) {
	enqueueToast({
		title: 'Markdown copied',
		description: description ?? 'Clean Markdown is ready to paste.',
		type: 'success',
		timeout: 2500,
	});
}

/**
 * Displays an error toast notifying the user that conversion failed.
 * @param description - Optional body text appended to the notification.
 */
export function showErrorToast(description?: string) {
	enqueueToast({
		title: 'Conversion failed',
		description: description ?? 'Please try again.',
		type: 'error',
		timeout: 5000,
	});
}
