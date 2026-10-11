import type { SiteCard } from "./metadata";

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Cloudflare's Email Address Obfuscation doesn't touch Worker-generated HTML, so emit its format directly:
// a random key byte followed by each character XORed with it, decoded in the browser by Cloudflare's script.
function cfEmail(address: string): string {
	const key = crypto.getRandomValues(new Uint8Array(1))[0];
	const hex = (n: number) => n.toString(16).padStart(2, "0");
	return hex(key) + [...address].map((c) => hex(c.charCodeAt(0) ^ key)).join("");
}

const CF_EMAIL_DECODE = "/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js";

// theme-color comes from someone else's page and ends up in a style attribute, so only allow plain colours.
const safeColor = (c: string | null) =>
	c && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]{3,20})$/i.test(c.trim()) ? c.trim() : null;

function card(s: SiteCard): string {
	const accent = safeColor(s.themeColor);
	const style = accent ? ` style="--accent:${esc(accent)}"` : "";
	const media = s.thumbnail
		? `<img class="thumb" src="${esc(s.thumbnail)}" alt="" loading="lazy" decoding="async">`
		: s.icon
			? `<div class="tile"><img src="${esc(s.icon)}" alt="" loading="lazy" decoding="async"></div>`
			: `<div class="tile"><span>${esc(s.title.charAt(0).toUpperCase())}</span></div>`;
	const favicon = s.favicon
		? `<img class="favicon" src="${esc(s.favicon)}" alt="" width="20" height="20" loading="lazy">`
		: "";
	return `<li>
	<a class="card" href="${esc(s.url)}"${style}>
		<div class="media">${media}</div>
		<div class="body">
			<h3>${favicon}<span>${esc(s.title)}</span></h3>
			${s.description ? `<p>${esc(s.description)}</p>` : ""}
			<span class="host">${esc(s.hostname)} <span aria-hidden="true">→</span></span>
		</div>
	</a>
</li>`;
}

export function renderPage(sites: SiteCard[]): string {
	const email = cfEmail("us@tactile.software");
	const list = sites.length
		? `<ul class="grid">${sites.map(card).join("\n")}</ul>`
		: `<p class="empty">Nothing here yet.</p>`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tactile Software</title>
<meta name="description" content="Software you can feel the quality of.">
<meta property="og:title" content="Tactile Software">
<meta property="og:description" content="Software you can feel the quality of.">
<meta name="theme-color" content="#16130f" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root {
	color-scheme: light dark;
	--bg: #f6f3ec; --surface: #fffdf8; --text: #1d1a15; --muted: #6b6457;
	--line: #e3ddd0; --tile: #ece6d9; --shadow: 0 1px 2px rgb(40 30 10 / .06), 0 8px 24px -12px rgb(40 30 10 / .18);
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #16130f; --surface: #1f1b16; --text: #f3efe6; --muted: #a39b8c;
		--line: #2f2a22; --tile: #29241d; --shadow: 0 1px 2px rgb(0 0 0 / .3), 0 12px 32px -16px rgb(0 0 0 / .6);
	}
}
* { box-sizing: border-box; }
body {
	margin: 0; background: var(--bg); color: var(--text);
	font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	-webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
header { padding: 88px 0 56px; }
h1 { font-size: clamp(2.4rem, 6vw, 4rem); line-height: 1.02; letter-spacing: -.035em; margin: 0 0 16px; font-weight: 700; }
.lede { font-size: 1.15rem; color: var(--muted); max-width: 34rem; margin: 0; }
.contact { display: inline-block; margin-top: 20px; color: var(--text); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
.contact:hover { border-color: var(--text); }
h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 600; margin: 0 0 20px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
.card {
	--accent: var(--tile);
	display: flex; flex-direction: column; height: 100%; text-decoration: none; color: inherit;
	background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
	box-shadow: var(--shadow); transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--muted) 40%, var(--line)); }
.card:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
.media { aspect-ratio: 1200 / 630; background: var(--accent); border-bottom: 1px solid var(--line); overflow: hidden; }
.thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.tile {
	width: 100%; height: 100%; display: grid; place-items: center;
	background: radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, var(--accent) 70%, white 12%), var(--accent));
}
.tile img { width: 30%; max-width: 96px; aspect-ratio: 1; object-fit: contain; filter: drop-shadow(0 6px 16px rgb(0 0 0 / .25)); }
.tile span { font-size: 3rem; font-weight: 700; color: var(--muted); }
.body { padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
h3 { margin: 0; font-size: 1.1rem; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
.favicon { width: 20px; height: 20px; border-radius: 5px; flex: none; }
.body p { margin: 0; color: var(--muted); font-size: .95rem; }
.host { margin-top: auto; padding-top: 8px; font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.card:hover .host { color: var(--text); }
.empty { color: var(--muted); }
footer { padding: 72px 0 48px; color: var(--muted); font-size: .85rem; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
</style>
</head>
<body>
<div class="wrap">
	<header>
		<h1>Tactile Software</h1>
		<p class="lede">Software you can feel the quality of.</p>
		<a class="contact" href="/cdn-cgi/l/email-protection#${email}"><span class="__cf_email__" data-cfemail="${email}">[email&#160;protected]</span></a>
	</header>
	<main>
		<section aria-labelledby="projects">
			<h2 id="projects">Projects</h2>
			${list}
		</section>
	</main>
	<footer>© ${new Date().getUTCFullYear()} Tactile Software</footer>
</div>
<script data-cfasync="false" src="${CF_EMAIL_DECODE}"></script>
</body>
</html>`;
}
