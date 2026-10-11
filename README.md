# tactile-software-page

The landing page for **tactile.software**. It's a single Cloudflare Worker (`tactile-landing`) that finds every other Worker
with a `*.tactile.software` hostname and renders a card for each one.

## How it works

1. **Discovery** (`src/discover.ts`): calls the Cloudflare API for
   - Workers Custom Domains: `GET /accounts/{account}/workers/domains?zone_name=tactile.software`
   - Workers Routes: `GET /zones/{zone}/workers/routes`. Wildcard patterns are skipped.

   It leaves out this Worker (`SELF_SERVICE`) and the hostname the page is served from.

   There's one card per Worker. If a Worker has several hostnames, the card uses the one set up first,
   going by its DNS record's `created_on`. Without DNS Read on the token, it uses the subdomain that best
   matches the Worker's name, then the shortest.
2. **Metadata** (`src/metadata.ts`): fetches each site's home page and web manifest, then fills in:

   | Field | Sources, in order |
   | --- | --- |
   | Title | `og:title`, `twitter:title`, `<title>`, manifest `name`, Worker name |
   | Description | `og:description`, `twitter:description`, `<meta name=description>`, manifest `description` |
   | Thumbnail | `og:image`, `twitter:image`. Without one, the card shows a tile with the largest manifest icon or apple-touch-icon on the site's `theme-color` |
   | Favicon | SVG `<link rel=icon>`, else the largest icon, else `/favicon.ico` |
3. **Render** (`src/render.ts`): server-rendered HTML with light and dark themes. The same data is also
   served as JSON at `/api/sites`.

The result is cached with the Cache API for 10 minutes, so a new Worker shows up within about 10 minutes of
getting its domain. The Cache API does nothing on `*.workers.dev`, so there every request rebuilds the list.

**To improve a card, improve the site's own tags.** Add `og:title`, `og:description` and a 1200×630
`og:image` to a project's `<head>` and its card picks them up.

## Setup

```sh
npm install
cp .dev.vars.example .dev.vars        # put the token in CF_API_TOKEN
npm run dev                           # http://localhost:8787
npm run check                         # typecheck
npm run deploy
npx wrangler secret put CF_API_TOKEN  # once, for the deployed Worker
```

### API token

The token is named `tactile-landing: read workers` and is owned by the account. It has two read-only permissions:

- Account → **Workers Scripts: Read** (lists custom domains)
- Zone `tactile.software` → **Workers Routes: Read**
- Zone `tactile.software` → **DNS: Read** (optional; used to pick a Worker's original hostname)

### Serving it at tactile.software

To serve it from the apex, add this to `wrangler.jsonc` and deploy again:

```jsonc
"routes": [{ "pattern": "tactile.software", "custom_domain": true }]
```
