import { discoverWorkers } from "./discover";
import { fetchCard, type SiteCard } from "./metadata";
import { renderAbout, renderPage, renderPrivacyPolicy } from "./render";

const CACHE_KEY = "https://tactile-landing.internal/sites/v1";
const CACHE_TTL_S = 600;

async function buildSites(env: Env): Promise<SiteCard[]> {
	const hosts = await discoverWorkers(env);
	const cards = await Promise.all(hosts.map(fetchCard));
	return cards.sort((a, b) => a.title.localeCompare(b.title));
}

// The Cache API is per-data-centre and a no-op on workers.dev, which is fine: a miss just rebuilds.
async function getSites(env: Env, ctx: ExecutionContext): Promise<SiteCard[]> {
	const cache = caches.default;
	const hit = await cache.match(CACHE_KEY);
	if (hit) return hit.json();

	const sites = await buildSites(env);
	const res = Response.json(sites, { headers: { "Cache-Control": `max-age=${CACHE_TTL_S}` } });
	ctx.waitUntil(cache.put(CACHE_KEY, res));
	return sites;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
		}

		if (url.pathname === "/" || url.pathname === "/api/sites") {
			let sites: SiteCard[];
			try {
				sites = (await getSites(env, ctx)).filter((s) => s.hostname !== url.hostname);
			} catch (err) {
				console.error(err);
				return new Response("Could not load the list of sites.", { status: 502 });
			}
			const headers = { "Cache-Control": "public, max-age=60" };
			if (url.pathname === "/api/sites") return Response.json(sites, { headers });
			return new Response(renderPage(sites), {
				headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
			});
		}

		if (url.pathname === "/about" || url.pathname === "/about/") {
			return new Response(renderAbout(), {
				headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
			});
		}

		if (url.pathname === "/privacy-policy" || url.pathname === "/privacy-policy/") {
			return new Response(renderPrivacyPolicy(), {
				headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
			});
		}

		if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
			return new Response(FAVICON, {
				headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
			});
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#16130f"/><path d="M9 10h14M16 10v13" stroke="#f3efe6" stroke-width="3.2" stroke-linecap="round"/></svg>`;
