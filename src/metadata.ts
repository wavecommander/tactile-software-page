// Scrapes a site's home page (and its web manifest) for what a card needs.
// Order of preference for each field: Open Graph / Twitter, then plain HTML, then the manifest.

import type { WorkerHost } from "./discover";

export interface SiteCard {
	hostname: string;
	service: string;
	url: string;
	title: string;
	description: string | null;
	thumbnail: string | null;
	favicon: string | null;
	icon: string | null;
	themeColor: string | null;
	ok: boolean;
}

interface Scraped {
	meta: Record<string, string>;
	title: string;
	icons: { href: string; rel: string; sizes: string; type: string }[];
	manifest: string | null;
}

interface Manifest {
	name?: string;
	short_name?: string;
	description?: string;
	theme_color?: string;
	icons?: { src: string; sizes?: string; type?: string; purpose?: string }[];
}

const TIMEOUT_MS = 5000;

async function scrape(res: Response): Promise<Scraped> {
	const out: Scraped = { meta: {}, title: "", icons: [], manifest: null };
	let inTitle = false;
	await new HTMLRewriter()
		.on("meta", {
			element(el) {
				const key = (el.getAttribute("property") ?? el.getAttribute("name"))?.toLowerCase();
				const content = el.getAttribute("content");
				// First wins, so a dark-mode theme-color listed first is the one we keep.
				if (key && content && !(key in out.meta)) out.meta[key] = content.trim();
			},
		})
		.on("link", {
			element(el) {
				const rel = (el.getAttribute("rel") ?? "").toLowerCase();
				const href = el.getAttribute("href");
				if (!href) return;
				if (rel.split(/\s+/).includes("manifest")) out.manifest ??= href;
				else if (rel.includes("icon")) {
					out.icons.push({ href, rel, sizes: el.getAttribute("sizes") ?? "", type: el.getAttribute("type") ?? "" });
				}
			},
		})
		.on("title", {
			element(el) {
				inTitle = true;
				el.onEndTag(() => void (inTitle = false));
			},
			text(t) {
				if (inTitle) out.title += t.text;
			},
		})
		.transform(res)
		.arrayBuffer();
	return out;
}

function abs(href: string | undefined | null, base: string): string | null {
	if (!href) return null;
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
}

function largest(sizes: string | undefined): number {
	if (!sizes) return 0;
	if (sizes === "any") return 1e6; // SVG
	return Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
}

function pickFavicon(icons: Scraped["icons"], base: string): string | null {
	const plain = icons.filter((i) => !i.rel.includes("apple-touch") && !i.rel.includes("mask"));
	const svg = plain.find((i) => i.type.includes("svg") || i.href.endsWith(".svg"));
	const best = svg ?? plain.sort((a, b) => largest(b.sizes) - largest(a.sizes))[0] ?? icons[0];
	return abs(best?.href, base) ?? abs("/favicon.ico", base);
}

async function fetchManifest(url: string | null): Promise<Manifest | null> {
	if (!url) return null;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		return res.ok ? ((await res.json()) as Manifest) : null;
	} catch {
		return null;
	}
}

export async function fetchCard(host: WorkerHost): Promise<SiteCard> {
	const url = `https://${host.hostname}/`;
	const card: SiteCard = {
		...host,
		url,
		title: host.service,
		description: null,
		thumbnail: null,
		favicon: null,
		icon: null,
		themeColor: null,
		ok: false,
	};

	let page: Scraped;
	let base = url;
	try {
		const res = await fetch(url, {
			headers: { Accept: "text/html", "User-Agent": "tactile-landing/1.0 (+https://tactile.software)" },
			redirect: "follow",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return card;
		base = res.url || url;
		page = await scrape(res);
	} catch (err) {
		console.warn(`Could not fetch ${url}:`, err);
		return card;
	}

	const manifestUrl = abs(page.manifest, base);
	const manifest = await fetchManifest(manifestUrl);
	const m = page.meta;

	card.ok = true;
	card.title =
		m["og:title"] || m["twitter:title"] || page.title.trim() || manifest?.name || m["apple-mobile-web-app-title"] || host.service;
	card.description = m["og:description"] || m["twitter:description"] || m["description"] || manifest?.description || null;
	card.thumbnail = abs(m["og:image"] || m["og:image:url"] || m["twitter:image"] || m["twitter:image:src"], base);
	card.favicon = pickFavicon(page.icons, base);
	card.themeColor = m["theme-color"] || manifest?.theme_color || null;

	// A large icon for the tile shown when there's no social image: biggest manifest icon,
	// else the apple-touch-icon, else the favicon.
	const manifestIcon = [...(manifest?.icons ?? [])]
		.filter((i) => !i.purpose?.includes("monochrome") && !i.purpose?.includes("maskable"))
		.sort((a, b) => largest(b.sizes) - largest(a.sizes))[0];
	const touchIcon = page.icons.find((i) => i.rel.includes("apple-touch"));
	card.icon =
		(manifestIcon && manifestUrl ? abs(manifestIcon.src, manifestUrl) : null) ?? abs(touchIcon?.href, base) ?? card.favicon;

	return card;
}
