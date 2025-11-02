import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
	manifest_version: 3,
	name: 'Page to Markdown LLM Converter',
	version: '1.0.0',
	description: 'Converts the current page to Markdown suitable for LLM input.',
	permissions: ['activeTab', 'scripting', 'clipboardWrite', 'contextMenus', 'storage'],
	action: {
		default_title: 'Convert page to Markdown',
	},
	background: {
		service_worker: 'src/background.ts',
		type: 'module',
	},
	content_scripts: [
		{
			matches: ['<all_urls>'],
			js: ['src/content_script.ts'],
			run_at: 'document_idle',
		},
	],
	commands: {
		'convert-to-markdown': {
			suggested_key: {
				default: 'Ctrl+Shift+M',
				mac: 'Command+Shift+M',
			},
			description: 'Convert current page to Markdown',
		},
	},
	options_page: 'src/options.html',
});
