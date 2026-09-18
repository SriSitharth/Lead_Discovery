import type { LeadSearchInput } from '../types/search.types.js';
import type { DiscoveryResult } from './discovery.types.js';
import type { DiscoveryService } from './discovery.service.js';

export class MockDiscoveryService implements DiscoveryService {
  async search(input: LeadSearchInput): Promise<DiscoveryResult[]> {
    console.log(
      `Searching for "${input.category}" in "${input.location}"`,
    );

    return [
      {
        title: `${input.category} - ${input.location}`,
        url: 'https://example.com',
        snippet: `Example result for ${input.category} in ${input.location}`,
        searchSubcategory: input.category,
        source: 'Mock',
      },
    ];
  }
}