import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Field, Input, Toast } from '@base-ui-components/react';
import { DomainConfig, defaultDomainConfigs, saveCustomConfig } from '../rules';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cn } from '../ui/cn';

interface FormState {
	domain: string;
	selector: string;
	remove: string;
}

const emptyForm: FormState = {
	domain: '',
	selector: '',
	remove: '',
};

type ToastVariant = 'success' | 'error';

function useToast() {
	const manager = Toast.useToastManager();

	function notify(title: string, description: string, variant: ToastVariant = 'success') {
		manager.add({
			title,
			description,
			type: variant,
			timeout: 4000,
		});
	}

	return notify;
}

async function readCustomConfigs(): Promise<Record<string, DomainConfig>> {
	try {
		const result = await chrome.storage.sync.get('domainConfigs');
		return (result.domainConfigs ?? {}) as Record<string, DomainConfig>;
	} catch (error) {
		console.error('Failed to read custom configurations', error);
		return {};
	}
}

async function removeCustomConfig(domain: string): Promise<void> {
	const result = await chrome.storage.sync.get('domainConfigs');
	const configs = (result.domainConfigs ?? {}) as Record<string, DomainConfig>;
	delete configs[domain];
	await chrome.storage.sync.set({ domainConfigs: configs });
}

async function resetCustomConfigs(): Promise<void> {
	await chrome.storage.sync.remove('domainConfigs');
}

function formatRemoveList(remove?: string[]) {
	if (!remove || remove.length === 0) return '—';
	return remove.join(', ');
}

export function OptionsApp() {
	return (
		<Toast.Provider>
			<OptionsContent />
			<Toast.Viewport className="fixed bottom-4 right-4 flex w-80 flex-col gap-3" />
		</Toast.Provider>
	);
}

function OptionsContent() {
	const [form, setForm] = useState<FormState>(emptyForm);
	const [customConfigs, setCustomConfigs] = useState<Record<string, DomainConfig>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [editingDomain, setEditingDomain] = useState<string | null>(null);
	const toast = useToast();

	useEffect(() => {
		let active = true;
		(async () => {
			const configs = await readCustomConfigs();
			if (active) {
				setCustomConfigs(configs);
				setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
	}, []);

	const hasCustomConfigs = useMemo(() => Object.keys(customConfigs).length > 0, [customConfigs]);
	const sortedDefaults = useMemo(
		() => Object.entries(defaultDomainConfigs).sort(([a], [b]) => a.localeCompare(b)),
		[]
	);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (saving) return;

		const domain = form.domain.trim().toLowerCase();
		const selector = form.selector.trim();
		const remove = form.remove
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		if (!domain || !selector) {
			toast('Missing required fields', 'Domain and selector are required.', 'error');
			return;
		}

		setSaving(true);
		try {
			const config: DomainConfig = {
				selector,
				...(remove.length > 0 ? { remove } : {}),
			};
			await saveCustomConfig(domain, config);
			setCustomConfigs((prev) => ({
				...prev,
				[domain]: config,
			}));
			setForm(emptyForm);
			setEditingDomain(null);
			toast('Configuration saved', `${domain} now uses your custom selector.`);
		} catch (error) {
			console.error('Failed to save configuration', error);
			toast('Failed to save', 'Please try again.', 'error');
		} finally {
			setSaving(false);
		}
	}

	function handleEdit(domain: string, config: DomainConfig) {
		setForm({
			domain,
			selector: config.selector,
			remove: (config.remove ?? []).join('\n'),
		});
		setEditingDomain(domain);
	}

	async function handleDelete(domain: string) {
		try {
			await removeCustomConfig(domain);
			setCustomConfigs((prev) => {
				const { [domain]: _, ...rest } = prev;
				return rest;
			});
			toast('Configuration removed', `${domain} uses defaults again.`);
			if (editingDomain === domain) {
				setForm(emptyForm);
				setEditingDomain(null);
			}
		} catch (error) {
			console.error('Failed to delete configuration', error);
			toast('Failed to delete', 'Please try again.', 'error');
		}
	}

	async function handleReset() {
		try {
			await resetCustomConfigs();
			setCustomConfigs({});
			setForm(emptyForm);
			setEditingDomain(null);
			toast('Custom configurations cleared', 'Default rules restored.');
		} catch (error) {
			console.error('Failed to reset configurations', error);
			toast('Failed to reset', 'Please try again.', 'error');
		}
	}

	function handleChange<K extends keyof FormState>(key: K, value: string) {
		setForm((prev) => ({
			...prev,
			[key]: value,
		}));
	}

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50">
				<div className="flex flex-col items-center gap-3 text-slate-600">
					<span className="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
					<span>Loading settings…</span>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
				<header className="flex flex-col gap-3">
					<div className="inline-flex items-center gap-2">
						<span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
							Page to Markdown
						</span>
					</div>
					<h1 className="text-3xl font-semibold text-slate-900">Extraction Rules</h1>
					<p className="max-w-2xl text-base text-slate-600">
						Tailor how the extension captures and cleans content for specific domains. Define the
						main selector and optional elements to remove before converting to Markdown.
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
					<Card className="flex flex-col gap-8">
						<div>
							<h2 className="text-xl font-semibold text-slate-900">
								{editingDomain ? `Edit configuration` : 'Add configuration'}
							</h2>
							<p className="text-sm text-slate-600">
								Provide the domain you want to override and the selector that wraps the main article
								content.
							</p>
						</div>

						<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
							<div className="grid gap-4 md:grid-cols-2">
								<Field.Root className="flex flex-col gap-2">
									<Field.Label className="text-sm font-medium text-slate-700">Domain</Field.Label>
									<Field.Control>
										<Input
											className={cn(
												'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition',
												'focus:border-brand focus:ring-2 focus:ring-brand/30'
											)}
											placeholder="example.com"
											value={form.domain}
											onChange={(event) => handleChange('domain', event.target.value)}
											required
										/>
									</Field.Control>
									<Field.Description className="text-xs text-slate-500">
										Use the domain host only; subdomains are optional.
									</Field.Description>
								</Field.Root>

								<Field.Root className="flex flex-col gap-2">
									<Field.Label className="text-sm font-medium text-slate-700">
										Content selector
									</Field.Label>
									<Field.Control>
										<Input
											className={cn(
												'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition',
												'focus:border-brand focus:ring-2 focus:ring-brand/30'
											)}
											placeholder="article, main, #content"
											value={form.selector}
											onChange={(event) => handleChange('selector', event.target.value)}
											required
										/>
									</Field.Control>
									<Field.Description className="text-xs text-slate-500">
										CSS selector that wraps the article or main content.
									</Field.Description>
								</Field.Root>
							</div>

							<Field.Root className="flex flex-col gap-2">
								<Field.Label className="text-sm font-medium text-slate-700">
									Remove selectors
								</Field.Label>
								<Field.Control>
									<textarea
										className="h-28 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
										placeholder=".ads\n.sidebar\naction-buttons"
										value={form.remove}
										onChange={(event) => handleChange('remove', event.target.value)}
									/>
								</Field.Control>
								<Field.Description className="text-xs text-slate-500">
									Optional. One selector per line to strip ads, comments, or chrome.
								</Field.Description>
							</Field.Root>

							<div className="flex flex-wrap items-center gap-3">
								<Button type="submit" loading={saving}>
									{editingDomain ? 'Update configuration' : 'Save configuration'}
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={() => {
										setForm(emptyForm);
										setEditingDomain(null);
									}}
								>
									Clear form
								</Button>
								<Button type="button" variant="ghost" onClick={handleReset}>
									Reset custom rules
								</Button>
							</div>
						</form>

						<div className="flex flex-col gap-3">
							<div>
								<h3 className="text-lg font-semibold text-slate-900">Saved overrides</h3>
								<p className="text-sm text-slate-600">
									These domains use your custom selectors. Remove one to fall back to defaults.
								</p>
							</div>
							{hasCustomConfigs ? (
								<ul className="flex flex-col gap-3">
									{Object.entries(customConfigs)
										.sort(([a], [b]) => a.localeCompare(b))
										.map(([domain, config]) => (
											<li
												key={domain}
												className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
											>
												<div className="flex flex-wrap items-center justify-between gap-3">
													<div>
														<p className="text-sm font-semibold text-slate-900">{domain}</p>
														<p className="text-xs text-slate-500">
															{config.selector || '— selector missing —'}
														</p>
													</div>
													<div className="flex items-center gap-2">
														<Button
															type="button"
															variant="ghost"
															className="px-3 py-1 text-xs"
															onClick={() => handleEdit(domain, config)}
														>
															Edit
														</Button>
														<Button
															type="button"
															variant="destructive"
															className="px-3 py-1 text-xs"
															onClick={() => handleDelete(domain)}
														>
															Remove
														</Button>
													</div>
												</div>
												<p className="text-xs text-slate-600">
													Remove: {formatRemoveList(config.remove)}
												</p>
											</li>
										))}
								</ul>
							) : (
								<div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
									No overrides yet. Add a domain to customize its extraction.
								</div>
							)}
						</div>
					</Card>

					<div className="flex flex-col gap-6">
						<Card className="flex flex-col gap-4">
							<div>
								<h2 className="text-xl font-semibold text-slate-900">Built-in presets</h2>
								<p className="text-sm text-slate-600">
									These domain rules ship with the extension. You can override any of them above.
								</p>
							</div>
							<ul className="flex flex-col gap-3">
								{sortedDefaults.map(([domain, config]) => (
									<li key={domain} className="rounded-lg border border-slate-200 bg-white p-4">
										<p className="text-sm font-semibold text-slate-900">{domain}</p>
										<p className="text-xs text-slate-500">Selector: {config.selector}</p>
										{config.remove && (
											<p className="text-xs text-slate-500">
												Remove: {formatRemoveList(config.remove)}
											</p>
										)}
									</li>
								))}
							</ul>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
