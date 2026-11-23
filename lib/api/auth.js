// HMAC-signed session cookie.
const enc = (s) => new TextEncoder().encode(s);
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(data, secret) {
	const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return b64url(await crypto.subtle.sign('HMAC', key, enc(data)));
}
export function safeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}
export async function readRole(request, env) {
	const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)bc_sess=([^;]+)/);
	if (!m) return null;
	const [role, exp, sig] = decodeURIComponent(m[1]).split('.');
	if (!role || !exp || !sig || Date.now() > Number(exp)) return null;
	return safeEqual(sig, await hmac(`${role}.${exp}`, env.SESSION_SECRET)) ? role : null;
}
export async function sessionCookie(role, env, secure) {
	const days = role === 'kid' ? 60 : 14;
	const exp = Date.now() + days * 864e5;
	const value = `${role}.${exp}.${await hmac(`${role}.${exp}`, env.SESSION_SECRET)}`;
	return `bc_sess=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure ? '; Secure' : ''}`;
}
