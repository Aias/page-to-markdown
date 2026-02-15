export interface DomainConfig {
	selector: string;
	remove?: string[];
}

/**
 * Built-in domain overrides keyed by hostname, providing selectors and optional removal rules.
 */
export const defaultDomainConfigs: Record<string, DomainConfig> = {
	/** News sites. */
	'medium.com': {
		selector: 'article',
		remove: ['.pw-highlight-menu', '.js-postShareWidget', "[aria-label='responses']"],
	},
	'dev.to': {
		selector: 'article',
		remove: ['.article-actions', '.comment-subscription-form', '.ltag__tag'],
	},
	'stackoverflow.com': {
		selector: '#mainbar',
		remove: ['.js-post-menu', '.post-signature', '.s-aside'],
	},
	'github.com': {
		selector: "[itemprop='text']",
		remove: ['.js-comment-edit-button', '.timeline-comment-actions'],
	},
	/** Documentation sites. */
	'learn.microsoft.com': {
		selector: 'main',
		remove: ['#feedback-section', '.alert', 'nav'],
	},
	'developer.mozilla.org': {
		selector: 'article',
		remove: ['.prev-next', '.language-menu', '.on-github'],
	},
	/** General fallback. */
	'example.com': {
		selector: 'main',
		remove: ['nav', 'footer', '.ads-container'],
	},
};

/**
 * In-memory cache of the merged default and user-defined domain configurations.
 */
export const domainConfigs: Record<string, DomainConfig> = { ...defaultDomainConfigs };

function hasChromeStorage(): boolean {
	return typeof chrome !== 'undefined' && !!chrome.storage;
}

/**
 * Hydrates {@link domainConfigs} with user-defined overrides from Chrome sync storage.
 */
export async function loadCustomConfigs(): Promise<void> {
	if (!hasChromeStorage()) return;

	const result = await chrome.storage.sync.get('domainConfigs').catch((error: unknown) => {
		console.error('Failed to load custom domain configs:', error);
		return null;
	});

	for (const key of Object.keys(domainConfigs)) {
		delete domainConfigs[key];
	}
	Object.assign(domainConfigs, defaultDomainConfigs, result?.domainConfigs);
}

/**
 * Persists a custom domain configuration and updates the in-memory cache.
 * @param domain - Hostname associated with the configuration.
 * @param config - Selector and optional removal rules applied during conversion.
 */
export async function saveCustomConfig(domain: string, config: DomainConfig): Promise<void> {
	if (!hasChromeStorage()) return;

	const result = await chrome.storage.sync.get('domainConfigs').catch((error: unknown) => {
		console.error('Failed to load existing domain configs:', error);
		return null;
	});

	const existing = result?.domainConfigs;
	const customConfigs: Record<string, DomainConfig> = {
		...(typeof existing === 'object' && existing !== null ? existing : {}),
		[domain]: config,
	};

	await chrome.storage.sync.set({ domainConfigs: customConfigs }).catch((error: unknown) => {
		console.error('Failed to save custom domain config:', error);
	});

	domainConfigs[domain] = config;
}

/**
 * Deletes the saved override for the supplied domain and updates the in-memory cache.
 * @param domain - Hostname whose configuration should be removed.
 */
export async function removeCustomConfig(domain: string): Promise<void> {
	if (!hasChromeStorage()) return;

	const result = await chrome.storage.sync.get('domainConfigs');
	const configs = (result.domainConfigs ?? {}) as Record<string, DomainConfig>;
	delete configs[domain];
	await chrome.storage.sync.set({ domainConfigs: configs });
	delete domainConfigs[domain];
}

/**
 * Drops all stored custom domain overrides and resets in-memory cache to defaults.
 */
export async function resetCustomConfigs(): Promise<void> {
	if (!hasChromeStorage()) return;

	await chrome.storage.sync.remove('domainConfigs');
	for (const key of Object.keys(domainConfigs)) {
		delete domainConfigs[key];
	}
	Object.assign(domainConfigs, defaultDomainConfigs);
}
