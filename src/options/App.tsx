import { SpinnerIcon } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import {
	type DomainConfig,
	defaultDomainConfigs,
	removeCustomConfig,
	resetCustomConfigs,
	saveCustomConfig,
} from '../rules';

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

async function readCustomConfigs(): Promise<Record<string, DomainConfig>> {
	try {
		const result = await chrome.storage.sync.get('domainConfigs');
		return (result.domainConfigs ?? {}) as Record<string, DomainConfig>;
	} catch (error) {
		console.error('Failed to read custom configurations', error);
		return {};
	}
}

function formatRemoveList(remove?: string[]) {
	if (!remove || remove.length === 0) return '—';
	return remove.join(', ');
}

export function OptionsApp() {
	return (
		<>
			<OptionsContent />
			<Toaster position="bottom-right" />
		</>
	);
}

function OptionsContent() {
	const [form, setForm] = useState<FormState>(emptyForm);
	const [customConfigs, setCustomConfigs] = useState<Record<string, DomainConfig>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [editingDomain, setEditingDomain] = useState<string | null>(null);

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
			toast.error('Missing required fields', {
				description: 'Domain and selector are required.',
			});
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
			toast.success('Configuration saved', {
				description: `${domain} now uses your custom selector.`,
			});
		} catch (error) {
			console.error('Failed to save configuration', error);
			toast.error('Failed to save', { description: 'Please try again.' });
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
			toast.success('Configuration removed', {
				description: `${domain} uses defaults again.`,
			});
			if (editingDomain === domain) {
				setForm(emptyForm);
				setEditingDomain(null);
			}
		} catch (error) {
			console.error('Failed to delete configuration', error);
			toast.error('Failed to delete', { description: 'Please try again.' });
		}
	}

	async function handleReset() {
		try {
			await resetCustomConfigs();
			setCustomConfigs({});
			setForm(emptyForm);
			setEditingDomain(null);
			toast.success('Custom configurations cleared', {
				description: 'Default rules restored.',
			});
		} catch (error) {
			console.error('Failed to reset configurations', error);
			toast.error('Failed to reset', { description: 'Please try again.' });
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
			<div className="flex min-h-screen items-center justify-center">
				<div className="text-muted-foreground flex flex-col items-center gap-3">
					<SpinnerIcon className="size-6 animate-spin" />
					<span>Loading settings…</span>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
				<header className="flex flex-col gap-3">
					<div className="inline-flex items-center gap-2">
						<span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
							Page to Markdown
						</span>
					</div>
					<h1 className="font-heading text-3xl font-semibold">Extraction Rules</h1>
					<p className="text-muted-foreground max-w-2xl text-base">
						Tailor how the extension captures and cleans content for specific domains. Define the
						main selector and optional elements to remove before converting to Markdown.
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								{editingDomain ? 'Edit configuration' : 'Add configuration'}
							</CardTitle>
							<CardDescription>
								Provide the domain you want to override and the selector that wraps the main article
								content.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-6">
							<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="flex flex-col gap-2">
										<Label htmlFor="domain">Domain</Label>
										<Input
											id="domain"
											placeholder="example.com"
											value={form.domain}
											onChange={(event) => handleChange('domain', event.target.value)}
											required
										/>
										<p className="text-muted-foreground text-xs">
											Use the domain host only; subdomains are optional.
										</p>
									</div>

									<div className="flex flex-col gap-2">
										<Label htmlFor="selector">Content selector</Label>
										<Input
											id="selector"
											placeholder="article, main, #content"
											value={form.selector}
											onChange={(event) => handleChange('selector', event.target.value)}
											required
										/>
										<p className="text-muted-foreground text-xs">
											CSS selector that wraps the article or main content.
										</p>
									</div>
								</div>

								<div className="flex flex-col gap-2">
									<Label htmlFor="remove">Remove selectors</Label>
									<Textarea
										id="remove"
										className="min-h-28"
										placeholder={'.ads\n.sidebar\naction-buttons'}
										value={form.remove}
										onChange={(event) => handleChange('remove', event.target.value)}
									/>
									<p className="text-muted-foreground text-xs">
										Optional. One selector per line to strip ads, comments, or chrome.
									</p>
								</div>

								<div className="flex flex-wrap items-center gap-3">
									<Button type="submit" disabled={saving}>
										{saving ? <SpinnerIcon className="animate-spin" /> : null}
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
									<h3 className="font-heading text-base font-medium">Saved overrides</h3>
									<p className="text-muted-foreground text-xs">
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
													className="border-border bg-muted/30 flex flex-col gap-2 rounded-md border p-4"
												>
													<div className="flex flex-wrap items-center justify-between gap-3">
														<div>
															<p className="text-sm font-semibold">{domain}</p>
															<p className="text-muted-foreground text-xs">
																{config.selector || '— selector missing —'}
															</p>
														</div>
														<div className="flex items-center gap-2">
															<Button
																type="button"
																variant="ghost"
																size="sm"
																onClick={() => handleEdit(domain, config)}
															>
																Edit
															</Button>
															<Button
																type="button"
																variant="destructive"
																size="sm"
																onClick={() => handleDelete(domain)}
															>
																Remove
															</Button>
														</div>
													</div>
													<p className="text-muted-foreground text-xs">
														Remove: {formatRemoveList(config.remove)}
													</p>
												</li>
											))}
									</ul>
								) : (
									<div className="border-border text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
										No overrides yet. Add a domain to customize its extraction.
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					<div className="flex flex-col gap-6">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Built-in presets</CardTitle>
								<CardDescription>
									These domain rules ship with the extension. You can override any of them above.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="flex flex-col gap-3">
									{sortedDefaults.map(([domain, config]) => (
										<li key={domain} className="border-border bg-card rounded-md border p-4">
											<p className="text-sm font-semibold">{domain}</p>
											<p className="text-muted-foreground text-xs">Selector: {config.selector}</p>
											{config.remove && (
												<p className="text-muted-foreground text-xs">
													Remove: {formatRemoveList(config.remove)}
												</p>
											)}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
