/* Airbnb base, with Cloudflare Workers conventions layered on top
 * (tabs, single quotes, semicolons, 120 cols, ESM with explicit .js extensions). */
module.exports = {
	root: true,
	extends: ['airbnb-base'],
	parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
	env: { es2022: true },
	ignorePatterns: ['node_modules/', '.wrangler/', 'seed.sql'],
	rules: {
		// Cloudflare style: tabs
		indent: ['error', 'tab', { SwitchCase: 1 }],
		'no-tabs': 'off',
		'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true }],
		quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
		'comma-dangle': ['error', 'always-multiline'],
		'object-curly-newline': ['error', { consistent: true }],

		// ESM + Workers: explicit extensions, named exports are common
		'import/extensions': ['error', 'ignorePackages'],
		'import/prefer-default-export': 'off',
		'import/no-unresolved': ['error', { ignore: ['^cloudflare:'] }],

		// Workers/D1 handlers are async and often sequential by design
		'no-await-in-loop': 'off',
		'no-use-before-define': ['error', { functions: false }],
		'no-underscore-dangle': 'off',
		'no-console': ['warn', { allow: ['warn', 'error'] }],
		'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],
		'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
		'no-param-reassign': ['error', { props: false }],
	},
	overrides: [
		{
			// Pages Functions + shared lib run in the Workers runtime
			files: ['functions/**/*.js', 'lib/**/*.js'],
			env: { browser: false, node: false, worker: true },
			globals: { crypto: 'readonly', fetch: 'readonly', Response: 'readonly', Request: 'readonly', URL: 'readonly' },
		},
		{
			// Frontend
			files: ['public/**/*.js'],
			env: { browser: true },
			rules: {
				'no-alert': 'off',
				// Browser modules are served from the site root (e.g. '/js/common.js')
				'import/no-absolute-path': 'off',
				'import/no-unresolved': ['error', { ignore: ['^/js/'] }],
			},
		},
		{
			// Node-side tooling and tests
			files: ['scripts/**/*.{js,mjs}', 'test/**/*.{js,mjs}'],
			env: { node: true },
			rules: { 'no-console': 'off', 'import/no-extraneous-dependencies': 'off' },
		},
	],
};
