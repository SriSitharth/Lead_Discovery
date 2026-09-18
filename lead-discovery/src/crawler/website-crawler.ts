import {
  PlaywrightCrawler,
  RequestQueue,
  type PlaywrightCrawlerOptions,
} from 'crawlee';

import type { DiscoveryResult } from '../discovery/discovery.types.js';
import { extractContactInformation } from '../extractors/contact.extractor.js';
import type { Lead } from '../types/search.types.js';

function formatLastUpdatedTimestamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Maps discovery results directly to leads without crawling their websites.
 * Used for results that come from structured APIs (e.g. Google Places) that
 * already include contact info, and for non-crawlable URLs (e.g. Google Maps
 * listing pages with no dedicated website).
 */
export function mapDiscoveryResultsToLeads(
  results: DiscoveryResult[],
  category: string,
  location: string,
  seenLeadKeys: Set<string> = new Set<string>(),
): Lead[] {
  const leads: Lead[] = [];

  for (const result of results) {
    const lead: Lead = {
      companyName: result.title,
      contactPerson: null,
      mobile: result.phone ?? null,
      alternatePhone: null,
      landline: null,
      whatsapp: null,
      email: result.email ?? null,
      category,
      searchSubcategory: result.searchSubcategory,
      location,
      city: result.city ?? location,
      pincode: null,
      address: result.address ?? null,
      gstin: null,
      businessType: null,
      website: null,
      linkedin: null,
      instagram: null,
      facebook: null,
      x: null,
      youtube: null,
      source: resolveLeadSource(result),
      sourceUrl: result.url,
      lastUpdated: formatLastUpdatedTimestamp(),
    };

    if (!lead.mobile && !lead.email) continue;

    const leadKeys = getLeadKeys(lead);
    if (leadKeys.some((leadKey) => seenLeadKeys.has(leadKey))) continue;

    for (const leadKey of leadKeys) {
      seenLeadKeys.add(leadKey);
    }
    leads.push(lead);
  }

  return leads;
}

export async function crawlWebsites(
  results: DiscoveryResult[],
  category: string,
  location: string,
): Promise<Lead[]> {
  const seenLeadKeys = new Set<string>();
  const directResults = results.filter(
    (result) => !isCrawlableWebsite(result.url),
  );

  const leads: Lead[] = mapDiscoveryResultsToLeads(
    directResults,
    category,
    location,
    seenLeadKeys,
  );

  const crawlableResults = results.filter((result) =>
    isCrawlableWebsite(result.url),
  );
  const requestQueue = await RequestQueue.open();
  await requestQueue.drop();
  const freshRequestQueue = await RequestQueue.open();

  const options: PlaywrightCrawlerOptions = {
    headless: true,
    requestQueue: freshRequestQueue,
    maxRequestsPerCrawl: Math.max(1, results.length),
    maxConcurrency: 5,
    navigationTimeoutSecs: 60,
    maxRequestRetries: 2,

    errorHandler({ request, log }, error) {
      log.warning(
        `Request attempt failed for ${request.url}: ${getErrorMessage(error)}`,
      );
    },

    failedRequestHandler({ request, log }) {
      log.error(`Request permanently failed: ${request.url}`);
    },

    async requestHandler({ request, page, log }) {
      const title = await page.title();

      log.info(`Crawling: ${request.url}`);
      log.info(`Page title: ${title}`);

      const contact =
        await extractContactInformation(page);
      const discoveryResult = results.find(
        (result) => result.url === request.url,
      );

      const lead: Lead = {
        companyName: resolveCompanyName(
          discoveryResult?.title ?? null,
          title || contact.name || null,
        ),
        contactPerson: contact.contactPerson ?? null,

        mobile: contact.mobile ?? contact.phones[0] ?? discoveryResult?.phone ?? null,
        alternatePhone: contact.alternatePhone ?? null,
        landline: contact.landline ?? null,
        whatsapp: contact.whatsapp ?? null,
        email: contact.emails[0] ?? discoveryResult?.email ?? null,

        category,
        searchSubcategory: discoveryResult?.searchSubcategory ?? null,
        location,
        city: contact.city ?? discoveryResult?.city ?? location ?? null,
        pincode: contact.pincode ?? null,
        address: contact.address ?? discoveryResult?.address ?? null,
        gstin: contact.gstin,
        businessType: contact.businessType ?? null,

        website: request.url,

        linkedin:
          contact.socialProfiles.find(
            (profile) => profile.platform === 'linkedin',
          )?.url ?? null,
        instagram:
          contact.socialProfiles.find(
            (profile) => profile.platform === 'instagram',
          )?.url ?? null,
        facebook:
          contact.socialProfiles.find(
            (profile) => profile.platform === 'facebook',
          )?.url ?? null,
        x:
          contact.socialProfiles.find(
            (profile) => profile.platform === 'x',
          )?.url ?? null,
        youtube:
          contact.socialProfiles.find(
            (profile) => profile.platform === 'youtube',
          )?.url ?? null,

        source: resolveLeadSource(discoveryResult),
        sourceUrl: request.url,
        lastUpdated: formatLastUpdatedTimestamp(),
      };

      // Keep only leads that have at least
      // a mobile number or an email address.
      if (!lead.mobile && !lead.email) {
        log.info(
          `Skipping lead - no mobile or email: ${request.url}`,
        );

        return;
      }

      const leadKeys = getLeadKeys(lead);

      if (leadKeys.some((leadKey) => seenLeadKeys.has(leadKey))) {
        log.info(`Skipping duplicate lead: ${request.url}`);
        return;
      }

      for (const leadKey of leadKeys) {
        seenLeadKeys.add(leadKey);
      }
      leads.push(lead);

      console.log('\n--- Extracted Lead ---');
      console.log('Company Name:', lead.companyName);
      console.log('Mobile:', lead.mobile);
      console.log('Landline:', lead.landline);
      console.log('Email:', lead.email);
      console.log('Address:', lead.address);
      console.log('GSTIN:', lead.gstin);
      console.log('Website:', lead.website);
      console.log('Source:', lead.source);
    },
  };

  const crawler = new PlaywrightCrawler(options);

  const urls = crawlableResults.map((result) => result.url);

  try {
    await crawler.run(urls);
  } catch (error) {
    throw new Error(
      `Crawler failed for category "${category}": ${getErrorMessage(error)}`,
      { cause: error },
    );
  }

  console.log(
    `Collected ${leads.length} unique qualified leads for ${category}.`,
  );

  return leads;
}

function isCrawlableWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return !(
      url.hostname === 'google.com' ||
      url.hostname.endsWith('.google.com') && url.pathname.startsWith('/maps')
    );
  } catch {
    return false;
  }
}

function getLeadKeys(lead: Lead): string[] {
  const keys = [
    lead.mobile && `mobile:${normalizeKey(lead.mobile)}`,
    lead.email && `email:${normalizeKey(lead.email)}`,
    lead.website && `website:${normalizeKey(lead.website)}`,
  ].filter((key): key is string => Boolean(key));

  return keys.length > 0 ? keys : [`website:${lead.website}`];
}

export function resolveCompanyName(
  discoveryResultTitle: string | null,
  pageTitleOrContactName: string | null,
): string | null {
  const candidates = [
    pageTitleOrContactName,
    discoveryResultTitle,
  ].filter((value): value is string => Boolean(value));

  const selected = candidates.find((value) => !isGenericCompanyTitle(value));
  return selected ?? null;
}

export function resolveLeadSource(
  discoveryResult: Pick<DiscoveryResult, 'source'> | null | undefined,
  fallback = 'Unknown',
): string {
  const source = discoveryResult?.source?.trim();
  return source || fallback;
}

function isGenericCompanyTitle(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return true;

  const locationPattern = /\b(?:hyderabad|secunderabad|bangalore|bengaluru|chennai|delhi|mumbai|pune|kolkata|vizag|visakhapatnam|guntur|warangal|vijayawada)\b/;

  return (
    /^(?:top|best|list|find|how can i|what is|who are|real estate)\b/.test(normalized) ||
    /^(?:builders?|developers?|companies?|firms?|contractors?|suppliers?|dealers?|architects?)(?:\s+(?:in|of|for))\b/.test(normalized) ||
    /^(?:top\s+\d+|best\s+|list\s+of\s+|builders?\s+in\s+|developers?\s+in\s+|companies?\s+in\s+)/.test(normalized) ||
    (locationPattern.test(normalized) && /\b(?:top|best|list|builders?|developers?|companies?|firms?|contractors?|real estate)\b/.test(normalized))
  );
}

function normalizeKey(value: string | null): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}