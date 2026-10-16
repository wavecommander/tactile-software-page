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

const STYLES = `
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
footer { padding: 72px 0 48px; color: var(--muted); font-size: .85rem; display: flex; flex-wrap: wrap; gap: 8px 20px; }
footer a { color: inherit; }
footer a:hover { color: var(--text); }
.back { display: inline-block; margin-bottom: 28px; color: var(--muted); text-decoration: none; font-size: .95rem; }
.back:hover { color: var(--text); }
.prose { max-width: 40rem; }
.prose h2 { margin-top: 44px; }
.prose p, .prose li { color: var(--text); }
.prose ul { padding-left: 1.2em; }
.prose a { color: inherit; }
.updated { color: var(--muted); margin: 0; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
`;

const CONTACT = "us@tactile.software";
const contactLink = (cls = "") => {
	const email = cfEmail(CONTACT);
	return `<a${cls ? ` class="${cls}"` : ""} href="/cdn-cgi/l/email-protection#${email}"><span class="__cf_email__" data-cfemail="${email}">[email&#160;protected]</span></a>`;
};

function layout(opts: { title: string; description: string; header: string; main: string }): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta name="theme-color" content="#16130f" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
	<header>
		${opts.header}
	</header>
	<main>
		${opts.main}
	</main>
	<footer><span>© ${new Date().getUTCFullYear()} Tactile Software Ltd.</span><a href="/about">About</a><a href="/privacy-policy">Privacy Policy</a></footer>
</div>
<script data-cfasync="false" src="${CF_EMAIL_DECODE}"></script>
</body>
</html>`;
}

export function renderPage(sites: SiteCard[]): string {
	const list = sites.length
		? `<ul class="grid">${sites.map(card).join("\n")}</ul>`
		: `<p class="empty">Nothing here yet.</p>`;
	return layout({
		title: "Tactile Software",
		description: "Software you can feel the quality of.",
		header: `<h1>Tactile Software</h1>
		<p class="lede">Software you can feel the quality of.</p>
		${contactLink("contact")}`,
		main: `<section aria-labelledby="projects">
			<h2 id="projects">Projects</h2>
			${list}
		</section>`,
	});
}

export function renderAbout(): string {
	return layout({
		title: "About · Tactile Software",
		description: "Tactile Software is a company founded by Ben Waver, making software from Canada.",
		header: `<a class="back" href="/"><span aria-hidden="true">←</span> Tactile Software</a>
		<h1>About</h1>`,
		main: `<article class="prose">
			<p>Tactile Software is a company founded by <a href="https://github.com/wavecommander">Ben Waver</a>, making software from Canada.</p>
		</article>`,
	});
}

const PARTNERS = [
	{ name: "Cloudflare", policy: "https://www.cloudflare.com/privacypolicy/" },
	{ name: "Google", policy: "https://policies.google.com/privacy" },
];

export function renderPrivacyPolicy(): string {
	const partners = PARTNERS.map((p) => `<li><a href="${esc(p.policy)}">${esc(p.name)} Privacy Policy</a></li>`).join("\n");
	return layout({
		title: "Privacy Policy · Tactile Software",
		description: "Tactile Software Ltd does not collect or store any data.",
		header: `<a class="back" href="/"><span aria-hidden="true">←</span> Tactile Software</a>
		<h1>Privacy Policy</h1>
		<p class="updated">Last updated 15 October 2026</p>`,
		main: `<article class="prose">
			<h2>No data is collected</h2>
			<p>Tactile Software Ltd does not collect or store any data, at any point, in any use of the products it provides. That includes this website and every project listed on it.</p>

			<h2>Our partners</h2>
			<p>Our products are delivered using services from partners such as Cloudflare and Google. These partners are the only parties that store any data, and only their privacy policies apply to it:</p>
			<ul>
${partners}
			</ul>

			<h2>Contact</h2>
			<p>Questions about this policy can be sent to ${contactLink()}.</p>
		</article>`,
	});
}
