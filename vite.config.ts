import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import manifest from './manifest.config.ts';

export default defineConfig({
	plugins: [react(), tailwindcss(), crx({ manifest })],
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, './src'),
		},
	},
	build: {
		outDir: 'dist',
		minify: 'esbuild', // Uses esbuild internally for minification
		// The CRX plugin handles bundling into as few files as possible
		rollupOptions: {
			output: {
				// Adjust output filenames if needed
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name].js',
				assetFileNames: 'assets/[name][extname]',
			},
		},
	},
});
