import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import * as TurndownPluginGfm from 'turndown-plugin-gfm';

import type { DomainConfig } from './rules';

/**
 * Selectors that are removed from every page prior to conversion to eliminate common chrome.
 * Note: iframe and svg are handled by describeEmbeddedMedia/describeSVGs before this runs.
 */
export const DEFAULT_REMOVE_SELECTORS = [
	'script, style, noscript',
	'header, footer, aside, nav',
	'.share, [aria-label*=share], [role=button][data-action*=share]',
	'.ads, [class*=ad-], [id*=ad-]',
	'.newsletter, .cookie, .banner, .modal',
	'[class*=popup], [class*=overlay]',
	'.comments, #comments',
	'.related, .recommended',
];

// ---------------------------------------------------------------------------
// Pure string helpers
// ---------------------------------------------------------------------------

/**
 * Generates a URL-friendly slug that mimics GitHub-style heading IDs.
 * @param text - Raw heading text content.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Picks the highest quality candidate from a srcset descriptor string.
 * @param srcset - Raw srcset attribute value.
 * @returns Absolute or relative URL of the chosen source, or null if none.
 */
export function chooseBestSrcFromSrcset(srcset: string): string | null {
	const candidates = srcset
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [urlPart, descriptor] = entry.split(/\s+/, 2);
			let score = 1;
			if (descriptor) {
				const match = descriptor.match(/([\d.]+)(w|x)/);
				if (match) {
					const value = parseFloat(match[1]);
					if (match[2] === 'w') {
						score = value;
					} else if (match[2] === 'x') {
						score = value * 100;
					}
				}
			}
			return { url: urlPart, score };
		})
		.filter((candidate) => !!candidate.url);

	if (candidates.length === 0) {
		return null;
	}

	candidates.sort((a, b) => b.score - a.score);
	return candidates[0]?.url || null;
}

/**
 * Returns the first string with non-whitespace content from the provided list.
 * @param values - Candidate string values to scan.
 */
export function firstNonEmpty(values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		if (typeof value !== 'string') {
			continue;
		}
		const trimmed = value.trim();
		if (trimmed) {
			return trimmed;
		}
	}
	return null;
}

/**
 * Escapes a string for safe embedding in a double-quoted YAML value.
 * @param value - Raw string to escape.
 */
export function escapeYaml(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
}

/**
 * Escapes double quotes within info strings used for fenced code metadata.
 * @param value - Raw metadata string.
 */
export function escapeInfoString(value: string): string {
	return value.replace(/"/g, '\\"');
}

/**
 * Performs final Markdown cleanup to ensure consistent spacing and formatting.
 * @param markdown - Markdown output produced by Turndown.
 */
export function postProcessMarkdown(markdown: string): string {
	return (
		markdown
			/** Collapse multiple blank lines. */
			.replace(/\n{3,}/g, '\n\n')
			/** Replace smart quotes. */
			.replace(/[\u201C\u201D]/g, '"')
			.replace(/[\u2018\u2019]/g, "'")
			/** Replace non-breaking spaces. */
			.replace(/\u00A0/g, ' ')
			/** Trim trailing whitespace from lines. */
			.split('\n')
			.map((line) => line.trimEnd())
			.join('\n')
			/** Trim final output. */
			.trim()
	);
}

/**
 * Removes existing front matter from Markdown to avoid duplicating metadata.
 * @param markdown - Raw Markdown content potentially containing YAML front matter.
 */
export function stripFrontMatter(markdown: string): {
	frontMatter: string | null;
	content: string;
} {
	const trimmed = markdown.trimStart();
	if (!trimmed.startsWith('---')) {
		return { frontMatter: null, content: markdown.trim() };
	}

	const lines = trimmed.split(/\r?\n/);
	let closingIndex = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i].trim() === '---') {
			closingIndex = i;
			break;
		}
	}

	if (closingIndex === -1) {
		return { frontMatter: null, content: markdown.trim() };
	}

	const contentLines = lines.slice(closingIndex + 1);
	return {
		frontMatter: lines.slice(0, closingIndex + 1).join('\n'),
		content: contentLines.join('\n').trim(),
	};
}

/**
 * Normalises fenced code blocks by trimming leading and trailing blank lines.
 * @param code - Code block content extracted from the DOM.
 */
export function trimFencePadding(code: string): string {
	const normalized = code.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');

	while (lines.length > 0 && lines[0].trim() === '') {
		lines.shift();
	}

	while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
		lines.pop();
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DOM manipulation helpers
// ---------------------------------------------------------------------------

/**
 * Promotes lazily-loaded image sources to the `src` attribute when possible.
 * @param img - Image element to normalize.
 */
export function resolveLazyImage(img: HTMLImageElement): void {
	const attrCandidates = [
		'data-src',
		'data-original',
		'data-lazy-src',
		'data-src-large',
		'data-image-src',
	];
	let chosenSrc = '';

	for (const attr of attrCandidates) {
		const value = img.getAttribute(attr);
		if (value && !value.startsWith('data:')) {
			chosenSrc = value;
			img.removeAttribute(attr);
			break;
		}
	}

	const srcsetCandidates = [
		img.getAttribute('data-srcset'),
		img.getAttribute('data-lazy-srcset'),
		img.getAttribute('data-original-srcset'),
		img.getAttribute('srcset'),
	].filter(Boolean) as string[];

	if (!chosenSrc && srcsetCandidates.length > 0) {
		for (const candidate of srcsetCandidates) {
			const best = chooseBestSrcFromSrcset(candidate);
			if (best) {
				chosenSrc = best;
				break;
			}
		}
	}

	const parentElement = img.parentElement;
	const picture =
		typeof HTMLPictureElement !== 'undefined' && parentElement instanceof HTMLPictureElement
			? parentElement
			: null;
	if (!chosenSrc && picture) {
		const pictureSources = Array.from(
			picture.querySelectorAll('source[srcset], source[data-srcset], source[data-src]')
		) as HTMLSourceElement[];

		for (const source of pictureSources) {
			const srcset =
				source.getAttribute('data-srcset') ||
				source.getAttribute('srcset') ||
				source.getAttribute('data-src');
			if (!srcset) {
				continue;
			}

			const best = chooseBestSrcFromSrcset(srcset);
			if (best) {
				chosenSrc = best;
				break;
			}
		}
	}

	if (chosenSrc) {
		try {
			img.src = new URL(chosenSrc, location.href).href;
		} catch (_err) {
			img.src = chosenSrc;
		}
	}
}

/**
 * Normalizes the extracted DOM by stripping noise, unused wrappers, and unsupported media.
 * @param el - Root element to clean in-place.
 * @param removeSelectors - Domain-specific selectors to strip after the defaults.
 */
export function cleanContent(el: HTMLElement, removeSelectors: string[]): void {
	const allRemoveSelectors = [...DEFAULT_REMOVE_SELECTORS, ...removeSelectors];
	allRemoveSelectors.forEach((sel) => {
		el.querySelectorAll(sel).forEach((node) => {
			node.remove();
		});
	});

	const mediaTags = new Set(['IMG', 'VIDEO', 'AUDIO', 'PICTURE', 'SOURCE']);
	el.querySelectorAll('*').forEach((node) => {
		const element = node as HTMLElement;

		if (mediaTags.has(element.tagName)) {
			return;
		}

		if (
			element.hidden ||
			element.getAttribute('aria-hidden') === 'true' ||
			element.style.display === 'none' ||
			element.style.visibility === 'hidden'
		) {
			element.remove();
			return;
		}

		if (
			!element.textContent?.trim() &&
			element.querySelectorAll('img, video, audio').length === 0
		) {
			element.remove();
			return;
		}
	});

	el.querySelectorAll('img').forEach((img) => {
		resolveLazyImage(img);

		const w = parseInt(img.getAttribute('width') || '0', 10);
		const h = parseInt(img.getAttribute('height') || '0', 10);
		if (w > 0 && w < 32 && h > 0 && h < 32) {
			img.remove();
			return;
		}

		if (img.src) {
			try {
				img.src = new URL(img.src, location.href).href;
			} catch (_e) {}
		}
	});
}

/**
 * Rewrites anchor URLs to remove tracking parameters while preserving relativity.
 * @param el - Element whose descendant links should be normalized.
 */
export function normalizeLinks(el: HTMLElement): void {
	const trackingParams = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref']);

	el.querySelectorAll('a[href]').forEach((anchor) => {
		const rawHref = anchor.getAttribute('href');
		if (!rawHref || rawHref.startsWith('javascript:')) {
			return;
		}

		if (rawHref.startsWith('#')) {
			return;
		}

		try {
			const url = new URL(rawHref, location.href);
			const paramsToDelete: string[] = [];

			url.searchParams.forEach((_, key) => {
				const lowerKey = key.toLowerCase();
				if (lowerKey.startsWith('utm_') || trackingParams.has(lowerKey)) {
					paramsToDelete.push(key);
				}
			});

			paramsToDelete.forEach((key) => {
				url.searchParams.delete(key);
			});
			anchor.setAttribute('href', url.toString());
		} catch (_err) {}
	});
}

/**
 * Replaces linked heading wrappers so that Markdown headings are not wrapped in anchors.
 * @param el - Element containing potential linked headings.
 */
export function unwrapHeadingLinks(el: HTMLElement): void {
	el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
		const element = heading as HTMLElement;
		if (element.childElementCount !== 1) {
			return;
		}

		const onlyChild = element.firstElementChild;
		if (!onlyChild || onlyChild.tagName !== 'A') {
			return;
		}

		const anchor = onlyChild as HTMLElement;
		element.innerHTML = anchor.innerHTML;
	});
}

/**
 * Consolidates metadata around code block containers from common MDX/rehype setups.
 * @param el - Element containing code figures to normalize.
 */
export function prepareCodeBlockContainers(el: HTMLElement): void {
	el.querySelectorAll('[data-rehype-pretty-code-figure]').forEach((figure) => {
		const pre = figure.querySelector('pre');
		if (!pre) {
			return;
		}

		const preElement = pre as HTMLElement;
		const panel = figure.querySelector('[data-language]') as HTMLElement | null;
		if (panel) {
			const panelLang =
				panel.getAttribute('data-language') ||
				panel.dataset.language ||
				panel.getAttribute('data-lang');
			if (panelLang && !preElement.dataset.language) {
				preElement.dataset.language = panelLang;
			}
		}

		const panelTitle = figure.querySelector('.CodeBlockPanelTitle') as HTMLElement | null;
		if (panelTitle && !preElement.dataset.title) {
			preElement.dataset.title = panelTitle.textContent?.trim() || '';
		}

		const labelledId = figure.getAttribute('aria-labelledby');
		if (labelledId && !preElement.dataset.title) {
			const labelEl = el.ownerDocument.getElementById(labelledId);
			if (labelEl?.textContent?.trim()) {
				preElement.dataset.title = labelEl.textContent.trim();
			}
		}

		figure.querySelectorAll('button, .CodeBlockPanel, .ScrollAreaScrollbar').forEach((node) => {
			node.remove();
		});
	});

	el.querySelectorAll('[role="figure"]').forEach((figure) => {
		if (!figure.querySelector('pre')) {
			return;
		}
		figure.querySelectorAll('button, [role="tablist"], [role="combobox"]').forEach((node) => {
			node.remove();
		});
	});
}

/**
 * Replaces SVG elements with textual descriptions, removing decorative/icon SVGs.
 * @param el - Element whose descendant SVGs are inspected.
 */
export function describeSVGs(el: HTMLElement): void {
	const svgs = Array.from(el.querySelectorAll('svg'));

	for (const svg of svgs) {
		const w = parseInt(svg.getAttribute('width') || '0', 10);
		const h = parseInt(svg.getAttribute('height') || '0', 10);
		if (w > 0 && w < 48 && h > 0 && h < 48) {
			svg.remove();
			continue;
		}

		const title = svg.querySelector('title')?.textContent?.trim();
		const desc = svg.querySelector('desc')?.textContent?.trim();
		const ariaLabel = svg.getAttribute('aria-label')?.trim();
		const description = title || desc || ariaLabel;

		if (description) {
			const placeholder = svg.ownerDocument.createElement('p');
			placeholder.textContent = `[SVG: ${description}]`;
			svg.replaceWith(placeholder);
			continue;
		}

		const parent = svg.parentElement;
		const parentTextLen = parent?.textContent?.trim().length ?? 0;
		const svgTextLen = svg.textContent?.trim().length ?? 0;
		if (parent && parentTextLen > svgTextLen) {
			svg.remove();
			continue;
		}

		const placeholder = svg.ownerDocument.createElement('p');
		placeholder.textContent = '[SVG diagram]';
		svg.replaceWith(placeholder);
	}
}

/**
 * Replaces embedded media with textual descriptions so Markdown consumers know what was present.
 * @param el - Element whose descendants are inspected for embeddable media.
 */
export function describeEmbeddedMedia(el: HTMLElement): void {
	const mediaNodes = Array.from(el.querySelectorAll('iframe, video, audio')) as HTMLElement[];

	mediaNodes.forEach((node) => {
		let rawSrc =
			node.getAttribute('src') ||
			node.getAttribute('data-src') ||
			node.getAttribute('data-url') ||
			'';

		if (!rawSrc && (node instanceof HTMLVideoElement || node instanceof HTMLAudioElement)) {
			const source = node.querySelector(
				'source[src], source[data-src], source[data-url]'
			) as HTMLSourceElement | null;
			if (source) {
				rawSrc =
					source.getAttribute('src') ||
					source.getAttribute('data-src') ||
					source.getAttribute('data-url') ||
					'';
			}
		}

		let resolvedUrl = '';
		if (rawSrc) {
			try {
				resolvedUrl = new URL(rawSrc, location.href).href;
			} catch (_err) {
				resolvedUrl = rawSrc;
			}
		}

		const title =
			node.getAttribute('title') ||
			node.getAttribute('aria-label') ||
			node.getAttribute('data-title') ||
			'';
		const type = node.nodeName.toLowerCase();
		let provider = '';
		if (resolvedUrl) {
			try {
				const url = new URL(resolvedUrl);
				provider = url.hostname.replace(/^www\./, '');
			} catch (_err) {
				provider = '';
			}
		}

		const parts: string[] = [`Embedded ${type}`];
		if (provider) {
			parts.push(`from ${provider}`);
		}
		if (title) {
			parts.push(`"${title}"`);
		}
		if (resolvedUrl) {
			parts.push(resolvedUrl);
		}

		const blockquote = node.ownerDocument.createElement('blockquote');
		blockquote.textContent = parts.join(' — ');

		node.replaceWith(blockquote);
	});
}

// ---------------------------------------------------------------------------
// Footnotes
// ---------------------------------------------------------------------------

export interface FootnoteDefinition {
	label: string;
	html: string;
}

/**
 * Converts footnote references and definitions into a Markdown-friendly structure.
 * @param el - Element containing potential footnote markup.
 * @returns An ordered list of extracted footnote definitions.
 */
export function convertFootnotes(el: HTMLElement): FootnoteDefinition[] {
	const footnotes: FootnoteDefinition[] = [];
	const idToLabel = new Map<string, string>();
	const idToHtml = new Map<string, string>();
	const usedLabels = new Set<string>();
	const escapeId =
		typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
			? (value: string) => CSS.escape(value)
			: (value: string) => value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
	const extractTargetId = (href: string | null): string => {
		if (!href) {
			return '';
		}
		if (href.startsWith('#')) {
			return href.slice(1);
		}
		try {
			const url = new URL(href, location.href);
			return url.hash ? url.hash.replace(/^#/, '') : '';
		} catch (_err) {
			return '';
		}
	};

	const registerFootnote = (targetId: string, anchor: HTMLAnchorElement): string | null => {
		if (!targetId) {
			return null;
		}

		if (!idToLabel.has(targetId)) {
			const rawLabel = anchor.textContent?.trim().replace(/^\[|\]$/g, '') || '';
			let labelCandidate = rawLabel;
			if (!labelCandidate || usedLabels.has(labelCandidate)) {
				let counter = usedLabels.size + 1;
				while (usedLabels.has(String(counter))) {
					counter += 1;
				}
				labelCandidate = String(counter);
			}
			usedLabels.add(labelCandidate);
			idToLabel.set(targetId, labelCandidate);

			const selector = `#${escapeId(targetId)}`;
			const definition = el.querySelector(selector) as HTMLElement | null;
			if (definition) {
				const definitionClone = definition.cloneNode(true) as HTMLElement;
				definitionClone
					.querySelectorAll(
						'a[role="doc-backlink"], a[href^="#fnref"], a[href^="#ref"], .footnote-backref'
					)
					.forEach((backref) => {
						backref.remove();
					});

				const sanitized = DOMPurify.sanitize(definitionClone.innerHTML).trim();
				if (sanitized) {
					idToHtml.set(targetId, sanitized);
				}

				const parent = definition.parentElement;
				definition.remove();
				if (parent && parent.children.length === 0 && /^(ol|ul)$/i.test(parent.tagName)) {
					parent.remove();
				}
			}
		}

		return idToLabel.get(targetId) || null;
	};

	const processedNodes = new Set<Node>();

	const supNodes = Array.from(el.querySelectorAll('sup'));
	supNodes.forEach((sup) => {
		const anchor = sup.querySelector('a[href]') as HTMLAnchorElement | null;
		if (!anchor) {
			return;
		}
		const targetId = extractTargetId(anchor.getAttribute('href'));
		const label = registerFootnote(targetId, anchor);
		if (!label) {
			return;
		}
		const replacement = sup.ownerDocument.createTextNode(`[^${label}]`);
		sup.replaceWith(replacement);
		processedNodes.add(anchor);
		processedNodes.add(sup);
	});

	const anchorSelectors = [
		'a[role="doc-noteref"]',
		'a[data-footnote-ref]',
		'a.footnote-ref',
		'a.fnref',
	];
	const anchorNodes = Array.from(
		el.querySelectorAll(anchorSelectors.join(','))
	) as HTMLAnchorElement[];
	anchorNodes.forEach((anchor) => {
		if (processedNodes.has(anchor)) {
			return;
		}
		const targetId = extractTargetId(anchor.getAttribute('href'));
		const label = registerFootnote(targetId, anchor);
		if (!label) {
			return;
		}
		const replacement = anchor.ownerDocument.createTextNode(`[^${label}]`);
		anchor.replaceWith(replacement);
		processedNodes.add(anchor);
	});

	idToLabel.forEach((label, targetId) => {
		const html = idToHtml.get(targetId);
		if (html) {
			footnotes.push({ label, html });
		}
	});

	return footnotes;
}

/**
 * Produces the Markdown appendix that lists captured footnotes.
 * @param service - Turndown instance used for HTML to Markdown conversion.
 * @param footnotes - Ordered collection of footnote definitions.
 */
export function renderFootnotes(service: TurndownService, footnotes: FootnoteDefinition[]): string {
	if (footnotes.length === 0) {
		return '';
	}

	return footnotes
		.map((footnote) => {
			const markdown = service.turndown(footnote.html).trim();
			if (!markdown) {
				return '';
			}
			const indented = markdown.replace(/\n/g, '\n    ');
			return `[^${footnote.label}]: ${indented}`;
		})
		.filter(Boolean)
		.join('\n');
}

// ---------------------------------------------------------------------------
// TOC & heading helpers
// ---------------------------------------------------------------------------

/**
 * Derives an indented Markdown table of contents using heading hierarchy.
 * @param el - Element inspected for headings.
 */
export function generateTOC(el: HTMLElement): string {
	const usedSlugs = new Map<string, number>();

	return Array.from(el.querySelectorAll('h1,h2,h3,h4,h5,h6'))
		.map((h) => {
			const heading = h as HTMLElement;
			const depth = parseInt(heading.tagName[1], 10) - 1;
			let slug = heading.id || slugify(heading.textContent || '');

			const count = usedSlugs.get(slug);
			if (count !== undefined) {
				const next = count + 1;
				usedSlugs.set(slug, next);
				slug = `${slug}-${next}`;
			} else {
				usedSlugs.set(slug, 0);
			}

			if (!heading.id) {
				heading.id = slug;
			}

			return `${'  '.repeat(depth)}- [${heading.textContent?.trim()}](#${slug})`;
		})
		.join('\n');
}

/**
 * Derives the language identifier for a code block using data attributes, classes, and wrappers.
 * @param pre - The <pre> element housing the code.
 * @param code - The optional <code> element inside the pre.
 * @param figure - A higher level wrapper that may contain metadata.
 */
export function extractLanguage(
	pre: HTMLElement,
	code: HTMLElement | null,
	figure: HTMLElement | null
): string | null {
	const candidates: Array<string | null | undefined> = [
		pre.dataset.language,
		pre.getAttribute('data-language'),
		pre.getAttribute('data-lang'),
		pre.getAttribute('lang'),
		code?.dataset?.language,
		code?.getAttribute('data-language'),
		code?.getAttribute('data-lang'),
		code?.getAttribute('lang'),
		figure?.getAttribute('data-language'),
	];

	const classSources = [pre.className, code?.className];
	classSources.forEach((className) => {
		if (!className) {
			return;
		}
		className.split(/\s+/).forEach((token) => {
			const match = token.match(/^(?:language|lang|code-language|highlight)-(.+)/i);
			if (match) {
				candidates.push(match[1]);
			}
		});
	});

	const language = firstNonEmpty(candidates);
	return language ? language.toLowerCase() : null;
}

/**
 * Attempts to derive an explicit title for a code block from assorted UI affordances.
 * @param pre - The <pre> node that forms the code block.
 * @param code - Nested <code> element that might store metadata.
 * @param figure - Wrapper element containing captions or labels.
 * @param demoContainer - Optional interactive container that exposes the active tab label.
 */
export function extractTitle(
	pre: HTMLElement,
	code: HTMLElement | null,
	figure: HTMLElement | null,
	demoContainer: HTMLElement | null
): string | null {
	const ariaLabelledBy = figure?.getAttribute('aria-labelledby');
	let labelledText: string | null = null;
	if (ariaLabelledBy) {
		const labelEl = pre.ownerDocument.getElementById(ariaLabelledBy);
		labelledText = labelEl?.textContent || null;
	}

	const candidates: Array<string | null | undefined> = [
		pre.dataset.title,
		pre.getAttribute('data-title'),
		pre.getAttribute('title'),
		code?.getAttribute('data-title'),
		code?.getAttribute('title'),
		figure?.querySelector('[data-rehype-pretty-code-title]')?.textContent,
		figure?.querySelector('.CodeBlockPanelTitle')?.textContent,
		labelledText,
		demoContainer?.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
		demoContainer?.querySelector('[data-selected]')?.textContent,
	];

	const title = firstNonEmpty(candidates);
	return title ? title.replace(/\s+/g, ' ').trim() : null;
}

// ---------------------------------------------------------------------------
// Article extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to locate the primary article element using Readability, falling back to heuristics.
 * @param doc - Document instance to evaluate.
 * @param hostname - Current page hostname for domain config lookup.
 * @param configs - Merged domain configurations keyed by hostname.
 */
export function getMainElement(
	doc: Document,
	hostname: string,
	configs: Record<string, DomainConfig>
): HTMLElement {
	const documentClone = doc.cloneNode(true) as Document;
	const article = new Readability(documentClone).parse();

	if (article?.content) {
		const el = doc.createElement('div');
		el.innerHTML = DOMPurify.sanitize(article.content);
		return el;
	}

	let selector = 'main';

	if (configs[hostname]) {
		selector = configs[hostname].selector;
	}

	const liveEl =
		(doc.querySelector(selector) as HTMLElement) ||
		(doc.querySelector('article, main') as HTMLElement) ||
		doc.body;
	return liveEl.cloneNode(true) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Turndown service factory
// ---------------------------------------------------------------------------

/**
 * Creates a configured Turndown service with GFM support and custom rules for
 * headings with IDs, rich code blocks, and figure captions.
 */
export function createTurndownService(): TurndownService {
	const service = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '_',
		strongDelimiter: '**',
	});

	service.use(TurndownPluginGfm.gfm);

	service.addRule('headingsWithIds', {
		filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
		replacement: (content, node) => {
			const hLevel = parseInt(node.nodeName.charAt(1), 10);
			const hPrefix = '#'.repeat(hLevel);
			const hContent = content.trim();
			const element = node as HTMLElement;

			if (element.id) {
				return `\n\n${hPrefix} ${hContent} {#${element.id}}\n\n`;
			}
			return `\n\n${hPrefix} ${hContent}\n\n`;
		},
	});

	service.addRule('richCodeBlocks', {
		filter: (node) => node.nodeName === 'PRE' && !!node.querySelector('code'),
		replacement: (_, node) => {
			const preElement = node as HTMLElement;
			const codeElement = preElement.querySelector('code') as HTMLElement | null;
			const figure = preElement.closest('[data-rehype-pretty-code-figure]') as HTMLElement | null;
			const demoContainer = preElement.closest('[data-demo]') as HTMLElement | null;

			const rawCode = codeElement?.textContent || preElement.textContent || '';
			const trimmedCode = trimFencePadding(rawCode);
			const language = extractLanguage(preElement, codeElement, figure);
			const title = extractTitle(preElement, codeElement, figure, demoContainer);

			const infoParts: string[] = [];
			if (language) {
				infoParts.push(language);
			}
			if (title) {
				infoParts.push(`title="${escapeInfoString(title)}"`);
			}
			const infoString = infoParts.length > 0 ? ` ${infoParts.join(' ')}` : '';

			return `\n\`\`\`${infoString}\n${trimmedCode}\n\`\`\`\n`;
		},
	});

	service.addRule('figureWithCaption', {
		filter: (node) => node.nodeName === 'FIGURE',
		replacement: (_, node) => {
			const figure = node as HTMLElement;
			const images = Array.from(figure.querySelectorAll('img'));
			if (images.length === 0) {
				return '\n\n';
			}

			const imageMarkdown = images
				.map((img) => {
					const alt = (img.getAttribute('alt') || '').trim();
					const title = (img.getAttribute('title') || '').trim();
					const src = img.getAttribute('src') || '';
					if (!src) {
						return '';
					}
					const titleSuffix = title ? ` "${title}"` : '';
					return `![${alt}](${src}${titleSuffix})`;
				})
				.filter(Boolean)
				.join('\n\n');

			const captionText = figure.querySelector('figcaption')?.textContent?.trim();
			const captionMarkdown = captionText ? `\n\n_${captionText}_` : '';

			return `\n\n${imageMarkdown}${captionMarkdown}\n\n`;
		},
	});

	return service;
}

// ---------------------------------------------------------------------------
// High-level conversion pipeline
// ---------------------------------------------------------------------------

export interface PageMetadata {
	title: string;
	source: string;
	author: string;
	description: string;
	retrieved: string;
}

/**
 * Builds YAML front matter from page metadata.
 */
export function buildFrontMatter(meta: PageMetadata): string {
	return `---
title: "${escapeYaml(meta.title)}"
source: "${meta.source}"
retrieved: "${meta.retrieved}"
author: "${escapeYaml(meta.author)}"
description: "${escapeYaml(meta.description)}"
tags: []
toc: true
---`;
}

/**
 * Assembles the final Markdown document from its constituent parts.
 */
export function buildOutput(frontMatter: string, toc: string, content: string): string {
	return [frontMatter, '', '## Table of Contents', '', toc, '', '---', '', content].join('\n');
}

/**
 * Runs the full DOM-to-Markdown conversion pipeline on an element.
 * @param el - Cloned root element to convert (will be mutated).
 * @param removeSelectors - Additional selectors to strip from the content.
 * @returns The processed Markdown body and a generated table of contents.
 */
export function convertToMarkdown(
	el: HTMLElement,
	removeSelectors: string[]
): { markdown: string; toc: string } {
	describeEmbeddedMedia(el);
	describeSVGs(el);
	cleanContent(el, removeSelectors);
	normalizeLinks(el);
	unwrapHeadingLinks(el);
	prepareCodeBlockContainers(el);

	const toc = generateTOC(el);
	const footnoteDefinitions = convertFootnotes(el);

	const turndownService = createTurndownService();

	const rawHtml = el.innerHTML;
	const sanitizedHtml = DOMPurify.sanitize(rawHtml);
	const markdownContent = turndownService.turndown(sanitizedHtml);
	const processedMarkdown = postProcessMarkdown(markdownContent);
	const footnoteMarkdown = renderFootnotes(turndownService, footnoteDefinitions);

	const markdown = footnoteMarkdown
		? `${processedMarkdown}\n\n${footnoteMarkdown}`
		: processedMarkdown;

	return { markdown, toc };
}
