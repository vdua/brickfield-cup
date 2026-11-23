import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test/e2e',
	fullyParallel: false,
	workers: 1,
	use: { baseURL: 'http://localhost:8799', trace: 'retain-on-failure' },
	webServer: {
		command: 'node test/dev-server.mjs',
		url: 'http://localhost:8799',
		env: { PORT: '8799', DB_FILE: ':memory:' },
		reuseExistingServer: false,
	},
});
