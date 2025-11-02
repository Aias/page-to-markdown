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
	'docs.microsoft.com': {
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
let domainConfigs: Record<string, DomainConfig> = { ...defaultDomainConfigs };

/**
 * Hydrates {@link domainConfigs} with user-defined overrides from Chrome sync storage.
 */
export async function loadCustomConfigs(): Promise<void> {
	try {
		if (typeof chrome !== 'undefined' && chrome.storage) {
			const result = await chrome.storage.sync.get('domainConfigs');
			if (result.domainConfigs) {
				domainConfigs = { ...defaultDomainConfigs, ...result.domainConfigs };
			}
		}
	} catch (error) {
		console.error('Failed to load custom domain configs:', error);
	}
}

/**
 * Persists a custom domain configuration and updates the in-memory cache.
 * @param domain - Hostname associated with the configuration.
 * @param config - Selector and optional removal rules applied during conversion.
 */
export async function saveCustomConfig(domain: string, config: DomainConfig): Promise<void> {
	try {
		const result = await chrome.storage.sync.get('domainConfigs');
		const customConfigs = result.domainConfigs || {};
		customConfigs[domain] = config;
		await chrome.storage.sync.set({ domainConfigs: customConfigs });
		domainConfigs[domain] = config;
	} catch (error) {
		console.error('Failed to save custom domain config:', error);
	}
}

/**
 * Retrieves the cached configuration for the provided domain.
 * @param domain - Hostname to look up.
 */
export function getDomainConfig(domain: string): DomainConfig | undefined {
	return domainConfigs[domain];
}

export { domainConfigs };
