# Lead Discovery

A TypeScript/Node.js tool that discovers business leads (builders, contractors,
suppliers, and related construction-industry categories) for a target city,
enriches them with contact details, and exports the results to an
incrementally-updated Excel workbook — one worksheet per lead category.

## How it works

For every configured lead category, the pipeline:

1. **Discovers** candidate businesses via a pluggable discovery provider
   (Google Places, Tavily web search, SearXNG, OpenStreetMap, or a mock
   provider for testing).
2. **Enriches** each result — for most providers, it visits each business's
   website with a headless browser (Crawlee + Playwright) to extract emails,
   phone numbers, addresses, GSTIN, social profiles, etc. Providers that
   already return rich structured data (currently Google Places) skip this
   crawl step entirely.
3. **Filters** out anything without at least a phone number or an email.
4. **Exports** the qualified leads to `output/leads-<location>.xlsx`,
   updating it after every category so partial progress is never lost.

```
Discovery (per category) → Website crawl / enrichment → Qualification → Excel export
```

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
```

Playwright browser binaries are installed automatically as a dependency of
`crawlee`/`playwright`. If browsers are missing, run:

```bash
npx playwright install chromium
```

## Configuration

Create a `.env` file in the project root (see `.env` for your local copy):

| Variable | Required for | Description |
| --- | --- | --- |
| `DISCOVERY_PROVIDER` | always | One of `google`, `tavily`, `searxng`, `osm`, `mock`. Defaults to `tavily`. |
| `GOOGLE_MAPS_API_KEY` | `DISCOVERY_PROVIDER=google` | API key for the [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) `searchText` endpoint. |
| `TAVILY_API_KEY` | `DISCOVERY_PROVIDER=tavily` | API key from [tavily.com](https://tavily.com). |
| `SEARXNG_URL` | `DISCOVERY_PROVIDER=searxng` | Base URL of a running SearXNG instance. |
| `LEAD_LOCATION` | optional | Default city/location to search in (e.g. `Hyderabad`). Overridable via `runLeadDiscovery({ location })`. |
| `LEAD_CATEGORY` | optional | Default category, group, or `all` to run (see below). Overridable via `runLeadDiscovery({ categoryFilter })`. |

The OpenStreetMap (`osm`) and Mock (`mock`) providers need no API key.

### Discovery providers

| Provider | Source | Crawls website for enrichment? |
| --- | --- | --- |
| `google` / `google-places` | Google Places API (Text Search) | No — Places already returns name, phone, address, city |
| `tavily` (default) | Tavily web search API | Yes |
| `searxng` / `searx` | Self-hosted SearXNG search | Yes |
| `osm` / `openstreetmap` / `overpass` | OpenStreetMap Nominatim + Overpass | Yes |
| `mock` | Static in-memory sample data, for tests/dev | Yes |

## Usage

Run a full discovery pass (all categories, using `.env` config):

```bash
npm run start
```

Run for a specific category, group, or location by setting env vars before
running, e.g. (PowerShell):

```powershell
$env:LEAD_CATEGORY = "Builders"; $env:LEAD_LOCATION = "Bangalore"; npm run start
```

`LEAD_CATEGORY` accepts:
- `all` — every configured category (default)
- a group name — `PROFESSIONALS`, `SERVICES`, or `PRODUCT_SUPPLIERS`
- an exact category name or slug — e.g. `Builders` or `builders`

Lead categories, their groups, and search terms are defined in
`src/config/lead-discovery-categories.ts`.

## Output

Results are written to `output/leads-<location>.xlsx`:

- **One worksheet per category** (e.g. `Builders`, `Contractors`, `Cement`),
  named after the specific category, capped to Excel's 31-character sheet
  name limit.
- Re-running the tool **appends** new, non-duplicate leads to existing sheets
  rather than overwriting them (dedup is based on mobile, email, company
  name, and website).
- The file is rewritten after each category finishes, so a failure partway
  through a run still leaves you with all leads collected so far.
- An **Errors** sheet lists any category that failed outright (e.g. API
  errors), with the failure message, so failures don't silently drop data.

### Columns

Two column layouts are used, chosen automatically per sheet based on whether
any lead in it has data that only a website crawl can produce:

- **Full** (crawled sources — Tavily, SearXNG, OSM, Mock): Company Name,
  Contact Person, Mobile, Alternate Phone, Landline, WhatsApp, Email,
  Category, Search Subcategory, City, Pincode, Address, GSTIN, Business Type,
  Website, LinkedIn, Instagram, Facebook, X, YouTube, Source, Source URL,
  Last Updated.
- **Minimal** (structured API sources with no crawl — Google Places): Company
  Name, Mobile, Category, Search Subcategory, City, Address, Source, Source
  URL, Last Updated.

The **Category** column shows the lead's broader group (`PROFESSIONALS`,
`SERVICES`, `PRODUCT_SUPPLIERS`); **Search Subcategory** shows the specific
category/search term that produced the lead (most useful with Tavily, which
searches multiple phrasings per category).

## Project structure

```
src/
  index.ts                          Orchestrates the per-category discovery → crawl → export loop
  types/search.types.ts             Lead & search input types
  config/
    lead-discovery-categories.ts    Categories, groups, search terms, geography config
  discovery/
    discovery.service.ts            DiscoveryService interface
    discovery.types.ts              DiscoveryResult type
    google-places-discovery.service.ts
    tavily-discovery.service.ts
    searxng-discovery.service.ts
    openstreetmap-discovery.service.ts
    mock-discovery.service.ts
  crawler/
    website-crawler.ts              Playwright/Crawlee-based website crawler → Lead mapping
  extractors/
    contact.extractor.ts            Parses a crawled page for emails, phones, address, GSTIN, socials, etc.
  export/
    excel.exporter.ts               Incremental, per-category Excel export
```

## Testing

```bash
npm test          # runs the TypeScript type checker
npx tsx --test src/index.test.ts   # runs the unit tests
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run start` | Run a full discovery pass |
| `npm run build` | Compile TypeScript to JS |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Alias for `typecheck` |
| `npm run clean:excel` | Delete timestamped fallback Excel files in `output/` |
