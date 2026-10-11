// Finds every Worker with a hostname on the zone, via the Cloudflare API.
// Covers both Workers Custom Domains and (non-wildcard) Workers Routes.

export interface WorkerHost {
	hostname: string;
	service: string;
	/** When the hostname's DNS record was created, if the token can read DNS. */
	createdOn?: string;
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

	const domains = await cf<{ hostname: string; service: string; zone_id: string }[]>(
		env,
		`/accounts/${env.CF_ACCOUNT_ID}/workers/domains?zone_name=${encodeURIComponent(zone)}`,
	);
	for (const d of domains) {
		if (d.hostname.endsWith(suffix)) hosts.set(d.hostname, { hostname: d.hostname, service: d.service });
	}

	// The rest is optional: a missing permission shouldn't hide the custom domains.
	let zoneId = domains[0]?.zone_id;
	try {
		zoneId ??= (await cf<{ id: string }[]>(env, `/zones?name=${encodeURIComponent(zone)}`))[0]?.id;
	} catch (err) {
		console.warn("Could not look up the zone:", err);
	}
	if (zoneId) {
		try {
			const routes = await cf<{ pattern: string; script?: string }[]>(env, `/zones/${zoneId}/workers/routes`);
			for (const r of routes) {
				if (!r.script) continue;
				const hostname = r.pattern.split("/")[0];
				if (hostname.includes("*") || !hostname.endsWith(suffix) || hosts.has(hostname)) continue;
				hosts.set(hostname, { hostname, service: r.script });
			}
		} catch (err) {
			console.warn("Skipping Workers Routes:", err);
		}
		try {
			const records = await cf<{ name: string; created_on: string }[]>(env, `/zones/${zoneId}/dns_records?per_page=1000`);
			for (const rec of records) {
				const h = hosts.get(rec.name);
				if (h && (!h.createdOn || rec.created_on < h.createdOn)) h.createdOn = rec.created_on;
			}
		} catch (err) {
			console.warn("No DNS dates (token lacks DNS Read?); picking hostnames by name instead:", err);
		}
	}

	return onePerWorker([...hosts.values()], zone, env.SELF_SERVICE);
}

// One card per Worker: a Worker on several hostnames (often by mistake) keeps only its best one.
export function onePerWorker(hosts: WorkerHost[], zone: string, self: string): WorkerHost[] {
	const byService = new Map<string, WorkerHost>();
	for (const h of hosts) {
		if (h.service === self) continue;
		const current = byService.get(h.service);
		if (!current || preferred(h, current, zone) < 0) byService.set(h.service, h);
	}
	return [...byService.values()];
}

// How closely the subdomain matches the Worker's name: exact, then one containing the other.
function nameMatch(h: WorkerHost, zone: string): number {
	const label = h.hostname.slice(0, -(zone.length + 1));
	if (label === h.service) return 0;
	if (h.service.includes(label) || label.includes(h.service)) return 1;
	return 2;
}

// Negative when `a` should win. The hostname that was set up first is the original, so it wins;
// without dates, fall back to the closest name match, then a shorter, then alphabetically first, hostname.
function preferred(a: WorkerHost, b: WorkerHost, zone: string): number {
	if (a.createdOn && b.createdOn && a.createdOn !== b.createdOn) return a.createdOn < b.createdOn ? -1 : 1;
	return (
		nameMatch(a, zone) - nameMatch(b, zone) ||
		a.hostname.length - b.hostname.length ||
		a.hostname.localeCompare(b.hostname)
	);
}
