import 'dotenv/config';

import { pathToFileURL } from 'node:url';

import { TavilyDiscoveryService } from './discovery/tavily-discovery.service.js';
import { MockDiscoveryService } from './discovery/mock-discovery.service.js';
import { OpenStreetMapDiscoveryService } from './discovery/openstreetmap-discovery.service.js';
import { SearxngDiscoveryService } from './discovery/searxng-discovery.service.js';
import { GooglePlacesDiscoveryService } from './discovery/google-places-discovery.service.js';
import { crawlWebsites, mapDiscoveryResultsToLeads } from './crawler/website-crawler.js';
import { exportLeadsToExcel } from './export/excel.exporter.js';
import { leadDiscoveryConfig } from './config/lead-discovery-categories.js';
import type { DiscoveryResult } from './discovery/discovery.types.js';
import type { DiscoveryService } from './discovery/discovery.service.js';
import type { Lead, LeadSearchInput } from './types/search.types.js';

export interface LeadDiscoveryError {
  category: string;
  message: string;
}

export interface RunLeadDiscoveryOptions {
  location?: string;
  categoryFilter?: string;
  discoveryFactory?: (category: string, location: string) => Promise<{
    search: (input: LeadSearchInput) => Promise<DiscoveryResult[]>;
    skipCrawl?: boolean;
  }>;
  crawlerFactory?: (
    results: DiscoveryResult[],
    category: string,
    location: string,
  ) => Promise<Lead[]>;
  exportLeads?: (
    leads: Lead[],
    location: string,
    categories: string[],
    errors: LeadDiscoveryError[],
  ) => Promise<string>;
}

export interface RunLeadDiscoveryResult {
  leads: Lead[];
  errors: LeadDiscoveryError[];
  exportedPath: string;
}

export async function runLeadDiscovery(
  options: RunLeadDiscoveryOptions = {},
): Promise<RunLeadDiscoveryResult> {
  const location = options.location?.trim() || process.env.LEAD_LOCATION?.trim() || 'Hyderabad';
  const requestedCategory = options.categoryFilter?.trim() || process.env.LEAD_CATEGORY?.trim() || 'all';
  const categories = selectCategories(requestedCategory);
  const categoryNames = categories.map((category) => category.name);
  const exportFile = options.exportLeads ?? exportLeadsToExcel;
  const allLeads: Lead[] = [];
  const errors: LeadDiscoveryError[] = [];
  let excelPath = '';

  for (const category of categories) {
    const searchInput: LeadSearchInput = {
      category: category.name,
      location,
    };

    try {
      const discovery = options.discoveryFactory
        ? await options.discoveryFactory(category.name, location)
        : createDiscoveryService();

      const results = await discovery.search(searchInput);

      console.log(`\nDiscovery results for ${category.name}:`);
      console.dir(results, { depth: null });

      let crawledLeads: Lead[];

      if (options.crawlerFactory) {
        crawledLeads = await options.crawlerFactory(
          results,
          searchInput.category,
          searchInput.location,
        );
      } else if (discovery.skipCrawl) {
        console.log(
          '\nSkipping website crawler (discovery source already includes contact info)...',
        );
        crawledLeads = mapDiscoveryResultsToLeads(
          results,
          searchInput.category,
          searchInput.location,
        );
      } else {
        console.log('\nStarting website crawler...');
        crawledLeads = await crawlWebsites(
          results,
          searchInput.category,
          searchInput.location,
        );
      }

      const leads = crawledLeads.map((lead) => ({
        ...lead,
        category: category.name,
      }));

      console.log(`\nExtracted ${leads.length} leads.`);
      allLeads.push(...leads);
    } catch (error) {
      const message = getErrorMessage(error);
      const errorEntry = {
        category: category.name,
        message,
      };

      errors.push(errorEntry);
      console.error(
        `\nFailed for category "${category.name}": ${message}`,
      );
    }

    console.log(`\nUpdating Excel file after ${category.name}...`);
    excelPath = await exportFile(
      allLeads,
      location,
      categoryNames,
      errors,
    );
  }

  console.log(`\nExcel file created: ${excelPath}`);

  return {
    leads: allLeads,
    errors,
    exportedPath: excelPath,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLeadDiscovery().catch((error) => {
    console.error('Lead discovery failed completely:', error);
    process.exitCode = 1;
  });
}

function selectCategories(requested: string) {
  if (requested.toLowerCase() === 'all') {
    return leadDiscoveryConfig.leadCategories;
  }

  const normalizedRequested = requested.trim().toLowerCase();
  const groupCategories = leadDiscoveryConfig.leadCategories.filter(
    (item) => item.group.toLowerCase() === normalizedRequested,
  );

  if (groupCategories.length > 0) {
    return groupCategories;
  }

  const category = leadDiscoveryConfig.leadCategories.find(
    (item) =>
      item.name.toLowerCase() === normalizedRequested ||
      item.slug.toLowerCase() === normalizedRequested,
  );

  if (!category) {
    throw new Error(
      `"${requested}" is not a lead category or group. Use a configured category name/slug, group, or LEAD_CATEGORY=all.`,
    );
  }

  return [category];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDiscoveryService(): DiscoveryService {
  const provider = process.env.DISCOVERY_PROVIDER?.trim().toLowerCase() || 'tavily';

  switch (provider) {
    case 'google':
    case 'google-places':
      return new GooglePlacesDiscoveryService();
    case 'osm':
    case 'openstreetmap':
    case 'overpass':
      return new OpenStreetMapDiscoveryService();
    case 'mock':
      return new MockDiscoveryService();
    case 'searxng':
    case 'searx':
      return new SearxngDiscoveryService();
    case 'tavily':
      return new TavilyDiscoveryService();
    default:
      throw new Error(
        `Unknown DISCOVERY_PROVIDER "${provider}". Use google, tavily, searxng, osm, or mock.`,
      );
  }
}