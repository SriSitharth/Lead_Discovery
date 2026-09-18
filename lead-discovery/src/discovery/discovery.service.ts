import type { LeadSearchInput } from '../types/search.types.js';
import type { DiscoveryResult } from './discovery.types.js';

export interface DiscoveryService {
  search(input: LeadSearchInput): Promise<DiscoveryResult[]>;

  /**
   * When true, the results returned by this service already contain enough
   * contact information (e.g. from a structured API like Google Places) and
   * should be used as leads directly, skipping the website crawler entirely.
   */
  readonly skipCrawl?: boolean;
}