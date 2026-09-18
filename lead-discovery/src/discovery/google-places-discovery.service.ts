import type { LeadSearchInput } from '../types/search.types.js';
import type { DiscoveryResult } from './discovery.types.js';
import type { DiscoveryService } from './discovery.service.js';

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: {
    longText?: string;
    types?: string[];
  }[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
  googleMapsUri?: string;
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

const GOOGLE_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText';
const MAX_PAGES = 3;
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.primaryType',
  'nextPageToken',
].join(',');

export class GooglePlacesDiscoveryService implements DiscoveryService {
  // Google Places already returns name, phone, and address for each result,
  // so there's no need to crawl the business website to extract contact info.
  readonly skipCrawl = true;

  private readonly apiKey: string;
  private readonly requestDelay = 200; // 200ms delay between requests (300 req/min = 200ms)
  private lastRequestTime = 0;

  constructor() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }

    this.apiKey = apiKey;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const remainingDelay = this.requestDelay - timeSinceLastRequest;

    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }

    this.lastRequestTime = Date.now();
  }

  async search(input: LeadSearchInput): Promise<DiscoveryResult[]> {
    const query = `${input.category} in ${input.location}`;
    const results: DiscoveryResult[] = [];
    let pageToken: string | undefined;

    console.log(`\n🔍 [Google Places] Searching for: "${query}"`);

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = await this.searchPlaces(query, pageToken);
      
      console.log(`📄 [Page ${page + 1}] Found ${data.places?.length ?? 0} places`);

      results.push(
        ...(data.places ?? [])
          .map((place, index) => {
            const result = toDiscoveryResult(place, input);
            if (!result) {
              console.log(`  ❌ [${index}] Filtered out - displayName: "${place.displayName?.text}" | website: ${place.websiteUri ? '✓' : '✗'} | gmaps: ${place.googleMapsUri ? '✓' : '✗'}`);
            }
            return result;
          })
          .filter((result): result is DiscoveryResult => result !== null),
      );

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    console.log(`✅ [Google Places] Total results after dedup: ${results.length}\n`);
    return deduplicateResults(results);
  }

  private async searchPlaces(
    query: string,
    pageToken?: string,
  ): Promise<GooglePlacesResponse> {
    await this.waitForRateLimit();

    const response = await fetch(GOOGLE_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Google Places API error ${response.status}: ${await response.text()}`,
      );
    }

    return (await response.json()) as GooglePlacesResponse;
  }
}

function toDiscoveryResult(
  place: GooglePlace,
  input: LeadSearchInput,
): DiscoveryResult | null {
  const title = place.displayName?.text?.trim();
  const websiteUrl = normalizeUrl(place.websiteUri);
  const sourceUrl = websiteUrl ?? normalizeUrl(place.googleMapsUri);
  const address = place.formattedAddress?.trim();

  if (!title || !sourceUrl) return null;

  const phone =
    place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null;
  const validPhone = isValidPhone(phone) ? phone : null;

  // Require at least one contact method: phone
  if (!validPhone) return null;

  const city = findAddressComponent(place, [
    'locality',
    'postal_town',
    'administrative_area_level_2',
  ]);

  // Log details about this result
  console.log(`  ✅ "${title}" | phone: ${validPhone} | ${address}`);

  return {
    title,
    url: sourceUrl,
    snippet: place.formattedAddress ?? null,
    searchSubcategory: input.category,
    phone: validPhone,
    address: place.formattedAddress ?? null,
    city: city ?? input.location,
    source: 'Google Places',
  };
}

function findAddressComponent(
  place: GooglePlace,
  types: string[],
): string | null {
  return (
    place.addressComponents?.find((component) =>
      component.types?.some((type) => types.includes(type)),
    )?.longText ?? null
  );
}

function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Must contain at least 7 digits and be mostly numeric
  const digitCount = cleaned.replace(/\D/g, '').length;
  return digitCount >= 7;
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function deduplicateResults(results: DiscoveryResult[]): DiscoveryResult[] {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}