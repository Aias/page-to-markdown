import {
	buildFrontMatter,
	buildOutput,
	convertToMarkdown,
	getMainElement,
	stripFrontMatter,
} from './convert';
import { domainConfigs, loadCustomConfigs } from './rules';
import { showErrorToast, showSuccessToast } from './toast';

declare global {
	interface Window {
		convertPageToMarkdown?: () => Promise<void>;
	}
}

/**
 * Retrieves canonical Markdown linked via an alternate rel, if available.
 * @returns The sanitized Markdown body or null when unavailable.
 */
async function fetchCanonicalMarkdown(): Promise<string | null> {
	const link = document.querySelector(
		'link[rel="alternate"][type="text/markdown"]'
	) as HTMLLinkElement | null;
	if (!link || !link.href) {
		return null;
	}

	try {
		const url = new URL(link.href, location.href);
		const response = await fetch(url.toString(), { credentials: 'same-origin' });
		if (!response.ok) {
			return null;
		}
		const text = await response.text();
		return text.trim();
	} catch (err) {
		console.warn('Failed to fetch alternate markdown:', err);
		return null;
	}
}

/**
 * Copies text to the clipboard, falling back to the legacy execCommand strategy when needed.
 * @param text - Markdown content to be copied.
 * @returns True when the clipboard update succeeds.
 */
async function copyToClipboard(text: string): Promise<boolean> {
	try {
		/** Try the modern clipboard API first. */
		await navigator.clipboard.writeText(text);
		return true;
	} catch (_err) {
		/** Fallback to the deprecated execCommand path when necessary. */
		console.log('Falling back to execCommand for clipboard');
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();

		try {
			const success = document.execCommand('copy');
			return success;
		} finally {
			document.body.removeChild(textarea);
		}
	}
}

/**
 * Orchestrates the end-to-end page conversion pipeline and copies Markdown to the clipboard.
 */
window.convertPageToMarkdown = async () => {
	try {
		await loadCustomConfigs();

		const hostname = window.location.hostname;
		const domainConfig = domainConfigs[hostname] || {};
		const removeSelectors = domainConfig.remove || [];

		const mainEl = getMainElement(document, hostname, domainConfigs);

		const title = document.title || '';
		const url = document.location.href || '';
		const descriptionMeta = document.querySelector('meta[name="description"]');
		const description = descriptionMeta?.getAttribute('content') || '';
		const authorMeta = document.querySelector('meta[name="author"]');
		const author = authorMeta?.getAttribute('content') || '';
		const retrievalDate = new Date().toISOString();

		let canonicalContent: string | null = null;
		try {
			const canonicalMarkdown = await fetchCanonicalMarkdown();
			if (canonicalMarkdown) {
				const parsed = stripFrontMatter(canonicalMarkdown);
				canonicalContent = parsed.content.trim();
			}
		} catch (canonicalError) {
			console.warn('Failed to load canonical markdown:', canonicalError);
		}

		let bodyContent: string;
		let toc: string;
		if (canonicalContent) {
			bodyContent = canonicalContent;
			toc = '';
		} else {
			const result = convertToMarkdown(mainEl, removeSelectors);
			bodyContent = result.markdown;
			toc = result.toc;
		}

		const frontMatter = buildFrontMatter({
			title,
			source: url,
			author,
			description,
			retrieved: retrievalDate,
		});

		const finalOutput = buildOutput(frontMatter, toc, bodyContent);

		const success = await copyToClipboard(finalOutput);
		if (success) {
			showSuccessToast('Markdown copied to clipboard.');
		} else {
			showErrorToast('Failed to copy. Check console for details.');
			console.error('Markdown output:', finalOutput);
		}
	} catch (err) {
		console.error('Failed to convert page to markdown:', err);
		showErrorToast('Error converting page. Check console.');
	}
};
