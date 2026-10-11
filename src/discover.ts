// Finds every Worker with a hostname on the zone, via the Cloudflare API.
// Covers both Workers Custom Domains and (non-wildcard) Workers Routes.

export interface WorkerHost {
	hostname: string;
	service: string;
}

interface CfResponse<T> {
	success: boolean;
	errors: { code: number; message: string }[];
	result: T;
}

async function cf<T>(env: Env, path: string): Promise<T> {
	const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
	});
	const body = (await res.json()) as CfResponse<T>;
	if (!body.success) {
		throw new Error(`Cloudflare API ${path}: ${body.errors.map((e) => e.message).join("; ")}`);
	}
	return body.result;
}

export async function discoverWorkers(env: Env): Promise<WorkerHost[]> {
	const zone = env.ZONE_NAME;
	const suffix = `.${zone}`;
	const hosts = new Map<string, WorkerHost>();

	const domains = await cf<{ hostname: string; service: string }[]>(
		env,
		`/accounts/${env.CF_ACCOUNT_ID}/workers/domains?zone_name=${encodeURIComponent(zone)}`,
	);
	for (const d of domains) {
		if (d.hostname.endsWith(suffix)) hosts.set(d.hostname, { hostname: d.hostname, service: d.service });
	}

	// Routes are optional: a missing zone or permission shouldn't hide the custom domains.
	try {
		const zones = await cf<{ id: string }[]>(env, `/zones?name=${encodeURIComponent(zone)}`);
		if (zones[0]) {
			const routes = await cf<{ pattern: string; script?: string }[]>(env, `/zones/${zones[0].id}/workers/routes`);
			for (const r of routes) {
				if (!r.script) continue;
				const hostname = r.pattern.split("/")[0];
				if (hostname.includes("*") || !hostname.endsWith(suffix) || hosts.has(hostname)) continue;
				hosts.set(hostname, { hostname, service: r.script });
			}
		}
	} catch (err) {
		console.warn("Skipping Workers Routes:", err);
	}

	return [...hosts.values()].filter((h) => h.service !== env.SELF_SERVICE);
}
