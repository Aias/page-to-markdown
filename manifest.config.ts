import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
	manifest_version: 3,
	name: 'Page to Markdown LLM Converter',
	version: '1.0.0',
	description: 'Converts the current page to Markdown suitable for LLM input.',
	permissions: ['activeTab', 'scripting', 'clipboardWrite', 'contextMenus', 'storage'],
	icons: {
		'16': 'public/icon-16.png',
		'32': 'public/icon-32.png',
		'48': 'public/icon-48.png',
		'128': 'public/icon-128.png',
	},
	action: {
		default_title: 'Convert page to Markdown',
		default_icon: {
			'16': 'public/icon-16.png',
			'32': 'public/icon-32.png',
			'48': 'public/icon-48.png',
			'128': 'public/icon-128.png',
		},
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
