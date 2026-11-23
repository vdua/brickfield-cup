// Cloudflare Pages Function: every request under /api/* is handled here (this runs as a Worker).
import { handle } from '../../lib/api.js';

export async function onRequest({ request, env }) {
	try {
		return await handle(request, env);
	} catch (e) {
		return new Response(JSON.stringify({ error: 'Server error', detail: String(e && e.message || e) }), {
			status: 500,
			headers: { 'content-type': 'application/json' },
		});
	}
}
