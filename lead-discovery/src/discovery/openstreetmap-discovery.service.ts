import type { DiscoveryResult } from './discovery.types.js';
import type { DiscoveryService } from './discovery.service.js';
import type { LeadSearchInput } from '../types/search.types.js';

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const SEARCH_RADIUS_METERS = 15000;
const MAX_RESULTS = 100;
const OVERPASS_RETRY_DELAYS_MS = [2000, 5000, 10000];

export class OpenStreetMapDiscoveryService implements DiscoveryService {
  async search(input: LeadSearchInput): Promise<DiscoveryResult[]> {
    const place = await geocode(input.location);
    const query = buildOverpassQuery(
      Number(place.lat),
      Number(place.lon),
      input.category,
    );
    const data = await queryOverpass(query);
    const categoryTerms = input.category.toLowerCase().split(/\s+/);

    return data.elements
      .map((element) => toDiscoveryResult(element, input.category, categoryTerms))
      .filter((result): result is DiscoveryResult => result !== null)
      .slice(0, MAX_RESULTS);
  }
}

async function geocode(location: string): Promise<NominatimPlace> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', location);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'lead-discovery/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error ${response.status}: ${await response.text()}`);
  }

  const places = (await response.json()) as NominatimPlace[];
  const place = places[0];
  if (!place) {
    throw new Error(`Location not found: ${location}`);
  }

  return place;
}

function buildOverpassQuery(
  latitude: number,
  longitude: number,
  category: string,
): string {
  const categoryPattern = category
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .map(escapeOverpassRegex)
    .join('|');

  return `[out:json][timeout:60];nwr["name"~"${categoryPattern}",i](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});out center tags;`;
}

function toDiscoveryResult(
  element: OverpassElement,
  category: string,
  categoryTerms: string[],
): DiscoveryResult | null {
  const tags = element.tags ?? {};
  const name = tags.name;
  if (!name || !matchesCategory(tags, categoryTerms)) {
    return null;
  }

  const website = tags.website || tags['contact:website'];
  const phone = tags.phone || tags['contact:phone'] || null;
  const city = tags['addr:city'] || tags['addr:town'] || null;
  const address = [
    tags['addr:housenumber'],
    tags['addr:street'],
    city,
  ]
    .filter(Boolean)
    .join(', ') || null;
  const elementUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;

  return {
    title: name,
    url: normalizeUrl(website) ?? elementUrl,
    snippet: [
      tags['addr:street'],
      tags['addr:city'],
      phone,
      website ? null : 'Website not listed in OpenStreetMap',
    ]
      .filter(Boolean)
      .join(' | ') || null,
    searchSubcategory: category,
      phone,
      email: tags.email || tags['contact:email'] || null,
      address,
      city,
      source: 'OpenStreetMap',
  };
}

function matchesCategory(tags: Record<string, string>, terms: string[]): boolean {
  const searchableText = Object.values(tags).join(' ').toLowerCase();
  return terms.some((term) => term.length > 2 && searchableText.includes(term));
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  const candidate = value.startsWith('http') ? value : `https://${value}`;

  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  let lastError = 'No Overpass endpoint was available';

  for (let attempt = 0; attempt < OVERPASS_RETRY_DELAYS_MS.length; attempt += 1) {
    const endpoint = OVERPASS_URLS[attempt % OVERPASS_URLS.length];

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'lead-discovery/1.0',
        },
        body: query,
      });

      if (response.ok) {
        return (await response.json()) as OverpassResponse;
      }

      lastError = `${endpoint} returned ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(OVERPASS_RETRY_DELAYS_MS[attempt]);
  }

  throw new Error(`Overpass request failed after retries: ${lastError}`);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeOverpassRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}