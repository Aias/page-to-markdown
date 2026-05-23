import { StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import sonnerStyles from 'sonner/dist/styles.css?inline';
import { Toaster } from '@/components/ui/sonner';
import tailwindStyles from '@/styles/tailwind.css?inline';

let toastRoot: Root | null = null;
let ready = false;
const pending: Array<() => void> = [];

function ReadyBridge() {
	useEffect(() => {
		ready = true;
		while (pending.length > 0) {
			pending.shift()?.();
		}
		return () => {
			ready = false;
		};
	}, []);
	return null;
}

function ensureHost() {
	if (toastRoot) return;

	const container = document.createElement('div');
	container.id = 'page-to-markdown-toast-root';
	document.documentElement.appendChild(container);

	const shadow = container.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = `${tailwindStyles}\n${sonnerStyles}`;
	shadow.appendChild(style);

	const mount = document.createElement('div');
	shadow.appendChild(mount);

	toastRoot = createRoot(mount);
	toastRoot.render(
		<StrictMode>
			<Toaster position="top-right" />
			<ReadyBridge />
		</StrictMode>
	);
}

function dispatch(fn: () => void) {
	ensureHost();
	if (ready) {
		fn();
	} else {
		pending.push(fn);
	}
}

export function showSuccessToast(description?: string) {
	dispatch(() =>
		toast.success('Markdown copied', {
			description: description ?? 'Clean Markdown is ready to paste.',
			duration: 2500,
		})
	);
}

export function showErrorToast(description?: string) {
	dispatch(() =>
		toast.error('Conversion failed', {
			description: description ?? 'Please try again.',
			duration: 5000,
		})
	);
}
