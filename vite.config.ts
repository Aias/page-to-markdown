import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
	plugins: [react(), tailwindcss(), crx({ manifest })],
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
