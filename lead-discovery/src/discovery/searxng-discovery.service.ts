import type { DiscoveryResult } from './discovery.types.js';
import type { DiscoveryService } from './discovery.service.js';
import type { LeadSearchInput } from '../types/search.types.js';

interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

export class SearxngDiscoveryService implements DiscoveryService {
  private readonly baseUrl: string;

  constructor() {
    const configuredUrl = process.env.SEARXNG_URL?.trim();

    if (!configuredUrl) {
      throw new Error(
        'SEARXNG_URL is not configured. Set it to your SearXNG instance URL.',
      );
    }

    this.baseUrl = configuredUrl.replace(/\/$/, '');
  }

  async search(input: LeadSearchInput): Promise<DiscoveryResult[]> {
    const queries = [
      `${input.category} in ${input.location}`,
      `${input.category} companies in ${input.location}`,
      `${input.category} services in ${input.location}`,
    ];
    const results: DiscoveryResult[] = [];

    for (const query of queries) {
      const url = new URL(`${this.baseUrl}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('categories', 'general');
      url.searchParams.set('language', 'en');
      url.searchParams.set('safesearch', '0');

      const response = await fetch(url, {
        headers: { 'User-Agent': 'lead-discovery/1.0' },
      });

      if (!response.ok) {
        throw new Error(
          `SearXNG API error ${response.status}: ${await response.text()}`,
        );
      }

      const data = (await response.json()) as SearxngResponse;
      results.push(
        ...(data.results ?? [])
          .filter(
            (result): result is SearxngResult & { title: string; url: string } =>
              Boolean(result.title && result.url),
          )
          .map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content ?? null,
            searchSubcategory: input.category,
            source: 'SearXNG',
          })),
      );
    }

    return deduplicateResults(results);
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