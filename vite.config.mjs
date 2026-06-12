import { defineConfig } from 'vite'
import * as path from 'path'

export default defineConfig({
	test: {
		environment: 'happy-dom',
		globals: true
	},
	resolve: {
		alias: {
			'~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
			'~bootstrap-icons': path.resolve(__dirname, 'node_modules/bootstrap-icons')
		}
	},
	base: '/capturetb-web/',
})
