// Uploads a worksheet JSON (from parse_paper.py) with its PDF through the two existing routes, rolling back on failure.
// usage: node upload.mjs BASE_URL PARENT_PIN WORKSHEET.json [PAPER.pdf]    e.g. http://localhost:8788 9999 out.json paper.pdf
import { readFileSync } from 'node:fs';

const [base, pin, jsonFile, pdfFile] = process.argv.slice(2);
if (!base || !pin || !jsonFile) { console.error('usage: node upload.mjs BASE_URL PARENT_PIN WORKSHEET.json [PAPER.pdf]'); process.exit(2); }
const { worksheet, questions } = JSON.parse(readFileSync(jsonFile, 'utf8'));
let cookie = '';
const call = async (method, path, body) => {
	const r = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
	const sc = r.headers.get('set-cookie');
	if (sc) [cookie] = sc.split(';');
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${data.error || ''}`);
	return data;
};
let id = null;
try {
	await call('POST', '/login', { role: 'parent', pin });
	const pdf = pdfFile ? readFileSync(pdfFile).toString('base64') : undefined;
	id = (await call('POST', '/parent/worksheets', { ...worksheet, pdf_base64: pdf })).id;
	const r = await call('POST', '/parent/questions/import', { worksheet_id: id, questions });
	console.log(`worksheet ${id} created with ${r.imported} questions`);
} catch (e) {
	if (id) await call('DELETE', `/parent/worksheets/${id}`).then(() => console.error(`rolled back worksheet ${id}`)).catch(() => console.error(`could not delete worksheet ${id}: delete it by hand`));
	console.error(e.message);
	process.exit(1);
}
