import { test, expect } from '@playwright/test';

const questions = Array.from({ length: 5 }, (_, i) => ({ q: `Q${i + 1}?`, o: ['a', 'b', 'c', 'd'], a: 1, t: 'Mock', d: 1 }));
const file = (name, obj) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
const paper = { worksheet: { title: 'E2E Mock', mode: 'screen', time_limit_min: 90, week: 0, runs_table: { 1: 1, 3: 3 } }, questions };

test.beforeEach(async ({ page, baseURL }) => {
	await page.route((url) => url.origin !== new URL(baseURL).origin, (route) => route.abort());
	await page.goto('/parent-login');
	for (const d of '9999') await page.locator(`#pad button[data-k="${d}"]`).click();
	await page.locator('#pad button[data-k="Go"]').click();
	await page.goto('/parent#worksheets');
	await page.locator('#addws summary').click();
});

test('add a worksheet from a JSON file: prefill, preview, submit', async ({ page }) => {
	await page.locator('input[name="json"]').setInputFiles(file('paper.json', paper));
	await expect(page.locator('input[name="title"]')).toHaveValue('E2E Mock');
	await page.locator('input[name="ranges"]').fill('4-5=3');
	await expect(page.locator('#addprev')).toContainText('5 questions');
	await expect(page.locator('#addprev')).toContainText('Q4-5 d3');
	await expect(page.locator('#addprev')).toContainText('max 9 runs'); // 3 x 1 + 2 x 3 with the table 1/3
	await page.locator('#addgo').click();
	await expect(page.locator('#main')).toContainText('E2E Mock');
});

test('paper mode without a PDF is refused in the form', async ({ page }) => {
	await page.locator('input[name="json"]').setInputFiles(file('paper.json', { ...paper, worksheet: { ...paper.worksheet, title: 'No PDF', mode: 'paper' } }));
	await page.locator('#addgo').click();
	await expect(page.locator('.toast')).toContainText('Paper mode needs the PDF');
	await expect(page.locator('#main')).not.toContainText('No PDF');
});

test('a failed import rolls the worksheet back', async ({ page }) => {
	await page.route('**/api/parent/questions/import', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"boom"}' }));
	await page.locator('input[name="json"]').setInputFiles(file('paper.json', { ...paper, worksheet: { ...paper.worksheet, title: 'Rolled back' } }));
	await page.locator('#addgo').click();
	await expect(page.locator('.toast')).toContainText('boom');
	const list = await page.evaluate(() => fetch('/api/parent/overview').then(() => fetch('/api/worksheets').then((r) => r.json())));
	expect(list.map((w) => w.title)).not.toContain('Rolled back');
});
