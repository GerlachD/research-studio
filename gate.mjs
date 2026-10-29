import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Auditní log: kdo, kdy, odkud a co v aplikaci dělal
let db;
export function openAudit(path) {
  db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, time TEXT NOT NULL, ip TEXT, user TEXT, action TEXT NOT NULL, detail TEXT)');
}
export function audit({ip = null, user = null}, action, detail = {}) {
  db.prepare('INSERT INTO audit (time, ip, user, action, detail) VALUES (?, ?, ?, ?, ?)').run(new Date().toISOString(), ip, user, action, JSON.stringify(detail));
}
export function auditRows(limit = 100) { return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit); }
// nginx předává skutečnou IP v X-Real-IP; bez proxy bereme adresu spojení
export const clientIp = req => req.headers['x-real-ip'] || req.socket.remoteAddress || null;

// Brána je aktivní jen při nastaveném APP_PASSWORD; lokálně aplikace běží bez přihlášení
const password = () => process.env.APP_PASSWORD || '';
const digest = value => createHash('sha256').update(String(value)).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));
const sign = value => createHmac('sha256', password()).update(value).digest('base64url');
const sessionHours = 12;

export const gateEnabled = () => Boolean(password());
export const checkPassword = input => gateEnabled() && safeEqual(input, password());
export function sessionToken(user, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({user, exp: now + sessionHours * 3600e3})).toString('base64url');
  return `${value}.${sign(value)}`;
}
export function sessionUser(req) {
  if (!gateEnabled()) return 'lokální';
  const [value, mac] = (/(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '').split('.');
  if (!value || !mac || !safeEqual(mac, sign(value))) return null;
  const {user, exp} = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  return exp > Date.now() ? user : null;
}

// ponytail: limit pokusů v paměti per IP, restart ho vynuluje; stačí proti hádání hesla
const failures = new Map(), windowMs = 15 * 60e3, maxFailures = 10;
export function tooManyAttempts(ip, now = Date.now()) {
  const entry = failures.get(ip);
  return Boolean(entry && entry.count >= maxFailures && now - entry.since < windowMs);
}
export function recordFailure(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry || now - entry.since >= windowMs) failures.set(ip, {count: 1, since: now}); else entry.count++;
}

export function loginPage(error = '') {
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Research Studio – přihlášení</title><link rel="icon" type="image/png" href="logo.png"><style>
:root{color-scheme:dark;font-family:Segoe UI,Arial,sans-serif;background:#1a1a1a;color:#e5e5e5}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box}
form{width:100%;max-width:360px;background:#202020;border:1px solid #353535;border-radius:14px;padding:32px;box-shadow:0 10px 30px #0004}
img{display:block;width:72px;height:72px;margin:0 auto 14px}
h1{text-align:center;font-size:22px;margin:0 0 4px;letter-spacing:-.03em}h1 span{color:#df6035}
p{text-align:center;color:#b0b4bb;font-size:13px;margin:0 0 24px}
label{display:block;font-size:13px;font-weight:650;margin-bottom:16px}
input{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border-radius:8px;border:1px solid #4a4a4a;background:#292929;color:#f0f0f0;font:inherit}
input:focus-visible,button:focus-visible{outline:3px solid #ffae82;outline-offset:2px}
button{width:100%;padding:13px;border:0;border-radius:8px;background:#df6035;color:#fff;font-weight:650;font-size:15px;cursor:pointer}
button:hover{background:#c94e29}.error{color:#ff9c8f;text-align:center;font-size:13px;margin:0 0 16px}
</style></head><body><form method="post" action="login"><img src="logo.png" alt="DG"><h1>Research Studio<span>.</span></h1><p>Multi-agentní výzkumný asistent</p>
${error ? `<p class="error" role="alert">${error}</p>` : ''}<label>Jméno<input name="name" required maxlength="60" autocomplete="name"></label><label>Heslo<input name="password" type="password" required autocomplete="current-password"></label><button>Vstoupit</button></form></body></html>`;
}
