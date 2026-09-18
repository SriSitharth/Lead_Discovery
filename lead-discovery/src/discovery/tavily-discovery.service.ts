import { leadDiscoveryConfig } from '../config/lead-discovery-categories.js';

import type { LeadSearchInput } from '../types/search.types.js';
import type { DiscoveryResult } from './discovery.types.js';
import type { DiscoveryService } from './discovery.service.js';

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

interface GeneratedQuery {
  query: string;
  searchSubcategory: string;
}

export class TavilyDiscoveryService implements DiscoveryService {
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }

    this.apiKey = apiKey;
  }

  async search(
    input: LeadSearchInput,
  ): Promise<DiscoveryResult[]> {
    const queries = generateSearchQueries(
      input.category,
      input.location,
    );

    console.log(
      `\nGenerated ${queries.length} search queries.`,
    );

    const cityResults: DiscoveryResult[] = [];

    for (let i = 0; i < queries.length; i++) {
      const { query, searchSubcategory } = queries[i];

      console.log(
        `\n[${i + 1}/${queries.length}] Searching: ${query}`,
      );

      try {
        const results = await this.searchTavily(
          query,
          searchSubcategory,
        );

        console.log(
          `Found ${results.length} results.`,
        );

        cityResults.push(...results);
      } catch (error) {
        console.error(
          `Search failed for "${query}":`,
          error,
        );
      }

      await sleep(300);
    }

    console.log(
      `\nCity-wide results: ${cityResults.length}. Area expansion is disabled.`,
    );

    const allResults = cityResults;

    const uniqueResults =
      deduplicateResults(allResults);

    console.log(
      `\nTotal discovered results: ${allResults.length}`,
    );

    console.log(
      `Unique discovered results: ${uniqueResults.length}`,
    );

    return uniqueResults;
  }

  private async searchTavily(
    query: string,
    searchSubcategory: string,
  ): Promise<DiscoveryResult[]> {
    const response = await fetch(
      'https://api.tavily.com/search',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: 'basic',
          max_results: 10,
          include_answer: false,
          include_raw_content: false,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Tavily API error ${response.status}: ${errorText}`,
      );
    }

    const data =
      (await response.json()) as TavilyResponse;

    return data.results
      .flatMap((result) => {
        const url = cleanUrl(result.url);

        if (!url) {
          return [];
        }

        return [{
          title: result.title,
          url,
          snippet: result.content ?? null,
          searchSubcategory,
          source: 'Tavily',
        } satisfies DiscoveryResult];
      });
  }
}

/**
 * Generates discovery queries from the central
 * lead discovery configuration.
 */
function generateSearchQueries(
  category: string,
  location: string,
): GeneratedQuery[] {
  const normalizedCategory =
    category.trim().toLowerCase();

  const categoryConfig =
    leadDiscoveryConfig.leadCategories.find(
      (item) =>
        matchesCategory(item.name, normalizedCategory) ||
        matchesCategory(item.slug, normalizedCategory),
    );

  if (!categoryConfig) {
    console.warn(
      `No category configuration found for "${category}".`,
    );

    return [
      `${category} in ${location}`,
      `${category} firms in ${location}`,
      `${category} companies in ${location}`,
    ].map((query) => ({
      query,
      searchSubcategory: category,
    }));
  }

  const queries: GeneratedQuery[] = [
    {
      query: `${category} in ${location}`,
      searchSubcategory: categoryConfig.name,
    },
  ];

  /*
   * Generate queries using every configured search term
   * and every configured area.
   */
  for (const searchTerm of categoryConfig.searchTerms) {
    queries.push(
      {
        query: `${searchTerm} in ${location}`,
        searchSubcategory: searchTerm,
      },
    );
  }

  return queries.filter(
    (query, index, allQueries) =>
      allQueries.findIndex(
        (candidate) => candidate.query === query.query,
      ) === index,
  );
}

function matchesCategory(
  configuredCategory: string,
  requestedCategory: string,
): boolean {
  const configured = configuredCategory
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const requested = requestedCategory
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return (
    configured === requested ||
    configured === `${requested}s` ||
    requested === `${configured}s`
  );
}

function cleanUrl(
  url: string,
): string | null {
  const markdownMatch = url.match(
    /^\[.*?\]\((https?:\/\/.*?)\)$/,
  );

  const cleanedUrl = markdownMatch
    ? markdownMatch[1]
    : url;

  try {
    const parsed = new URL(cleanedUrl);

    if (
      !['http:', 'https:'].includes(
        parsed.protocol,
      )
    ) {
      return null;
    }

    parsed.search = '';
    parsed.hash = '';

    return parsed.href;
  } catch {
    return null;
  }
}

function deduplicateResults(
  results: DiscoveryResult[],
): DiscoveryResult[] {
  const seenUrls = new Set<string>();

  return results.filter((result) => {
    const normalizedUrl =
      normalizeUrl(result.url);

    if (seenUrls.has(normalizedUrl)) {
      return false;
    }

    seenUrls.add(normalizedUrl);

    return true;
  });
}

function normalizeUrl(
  url: string,
): string {
  try {
    const parsed = new URL(url);

    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`
      .replace(/\/+$/, '')
      .toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}