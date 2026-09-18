import type { Page } from 'playwright';

export interface ContactExtraction {
  name: string | null;
  contactPerson: string | null;
  emails: string[];
  phones: string[];
  mobile: string | null;
  alternatePhone: string | null;
  landline: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  gstin: string | null;
  businessType: string | null;
  socialProfiles: {
    platform: string;
    url: string;
  }[];
}

export async function extractContactInformation(
  page: Page,
): Promise<ContactExtraction> {
  const links = await page.locator('a').evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      text: anchor.textContent?.trim() ?? '',
    })),
  );

  const pageText = await page.locator('body').innerText();
  const addressElements = await page
    .locator('address, [itemprop="address"]')
    .allInnerTexts();

  const name = await extractBusinessName(page, pageText);
  const contactPerson = extractContactPerson(pageText);
  const emails = extractEmails(pageText, links);
  const phones = extractPhones(pageText);
  const { mobile, alternatePhone, landline, whatsapp } = splitPhoneTypes(phones, pageText);
  const address = extractAddress(pageText, addressElements);
  const city = extractCity(pageText, address ?? '');
  const pincode = extractPincode(pageText, address ?? '');
  const gstin = extractGstin(pageText);
  const businessType = extractBusinessType(pageText, name ?? '');

  const socialProfiles = extractSocialProfiles(links);

  return {
    name,
    contactPerson,
    emails,
    phones,
    mobile,
    alternatePhone,
    landline,
    whatsapp,
    address,
    city,
    pincode,
    gstin,
    businessType,
    socialProfiles,
  };
}

function extractEmails(
  text: string,
  links: { href: string; text: string }[],
): string[] {
  const emailRegex =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  const textEmails = text.match(emailRegex) ?? [];

  const mailtoEmails = links
    .filter((link) => link.href.toLowerCase().startsWith('mailto:'))
    .map((link) => link.href.replace(/^mailto:/i, '').split('?')[0]);

  return uniqueValues([...textEmails, ...mailtoEmails]);
}

function extractPhones(text: string): string[] {
  const phoneRegex =
    /(?:\+?\d[\d\s().-]{7,}\d)/g;

  const matches = text.match(phoneRegex) ?? [];

  return uniqueValues(
    matches
      .map((phone) => normalizePhone(phone))
      .filter((phone) => {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 15;
      }),
  );
}

async function extractBusinessName(
  page: Page,
  text: string,
): Promise<string | null> {
  const h1Text = await page.locator('h1').first().textContent();
  const titleText = await page.title();

  const candidates = [
    h1Text,
    titleText,
    ...text
      .split(/\n|\r/)
      .map((line) => line.trim())
      .filter((line) => line.length > 2),
  ];

  const businessName = candidates
    .map((candidate) => normalizeBusinessName(candidate))
    .find((candidate): candidate is string => !!candidate && !isGenericBusinessTitle(candidate));

  return businessName ?? null;
}

function normalizeBusinessName(value: string | null | undefined): string | null {
  if (!value) return null;

  const cleaned = normalizeWhitespace(value)
    .replace(/\s*[-|•].*$/, '')
    .replace(/\s*\|\s*.*$/, '')
    .trim();

  if (!cleaned || /^(call|email|mobile|phone|address|location|website|home|contact|about|services)$/i.test(cleaned)) {
    return null;
  }

  return cleaned.length > 2 ? cleaned : null;
}

function isGenericBusinessTitle(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return true;

  const locationPattern = /\b(?:hyderabad|secunderabad|bangalore|bengaluru|chennai|delhi|mumbai|pune|kolkata|vizag|visakhapatnam|guntur|warangal|vijayawada)\b/;

  return (
    /^(?:top|best|list|find|how can i|what is|who are|real estate)\b/.test(normalized) ||
    /^(?:builders?|developers?|companies?|firms?|contractors?|suppliers?|dealers?|architects?)(?:\s+(?:in|of|for))\b/.test(normalized) ||
    /^(?:top\s+\d+|best\s+|list\s+of\s+|builders?\s+in\s+|developers?\s+in\s+|companies?\s+in\s+)/.test(normalized) ||
    (locationPattern.test(normalized) && /\b(?:top|best|list|builders?|developers?|companies?|firms?|contractors?|real estate)\b/.test(normalized))
  );
}

function splitPhoneTypes(
  phones: string[],
  text: string,
): {
  mobile: string | null;
  alternatePhone: string | null;
  landline: string | null;
  whatsapp: string | null;
} {
  const normalizedPhones = phones.filter(Boolean);

  const mobile =
    normalizedPhones.find((phone) => {
      const digits = phone.replace(/\D/g, '');
      return (
        digits.length === 10 ||
        (digits.length === 12 && digits.startsWith('91'))
      );
    }) ?? normalizedPhones[0] ?? null;

  const alternatePhone =
    normalizedPhones.find(
      (phone) => phone !== mobile && !isLikelyLandline(phone) && !isWhatsappPhone(phone, text),
    ) ?? null;

  const landline =
    normalizedPhones.find(
      (phone) => phone !== mobile && phone !== alternatePhone && isLikelyLandline(phone),
    ) ?? null;

  const whatsapp =
    normalizedPhones.find(
      (phone) => phone !== mobile && phone !== alternatePhone && phone !== landline && isWhatsappPhone(phone, text),
    ) ?? null;

  return { mobile, alternatePhone, landline, whatsapp };
}

function isLikelyLandline(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 8 || digits.length > 12) {
    return false;
  }

  return !(
    digits.length === 10 ||
    (digits.length === 12 && digits.startsWith('91'))
  );
}

function isWhatsappPhone(phone: string, text: string): boolean {
  const normalized = normalizePhone(phone);
  const lowerText = text.toLowerCase();

  return lowerText.includes('whatsapp') && lowerText.includes(normalized.toLowerCase().replace(/\s+/g, ''));
}

function extractContactPerson(text: string): string | null {
  const patterns = [
    /(?:contact\s+person|name\s*[:\-]|proprietor\s*[:\-]|manager\s*[:\-])\s*([A-Z][A-Za-z.\s'-]{2,60})/i,
    /(?:Mr\.|Mrs\.|Ms\.)\s*[A-Z][A-Za-z.\s'-]{2,50}/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]).replace(/\s+/g, ' ').trim();
    if (match?.[0]) return normalizeWhitespace(match[0]).replace(/(?:contact\s+person|name\s*[:\-]|proprietor\s*[:\-]|manager\s*[:\-])/i, '').trim();
  }

  return null;
}

function extractCity(text: string, address: string): string | null {
  const combined = `${text}\n${address}`;
  const cityMatch = combined.match(/\b(?:Hyderabad|Secunderabad|Bengaluru|Chennai|Delhi|Mumbai|Pune|Kolkata|Visakhapatnam|Guntur|Warangal|Vijayawada)\b/i);
  return cityMatch?.[0] ?? null;
}

function extractPincode(text: string, address: string): string | null {
  const combined = `${text}\n${address}`;
  const match = combined.match(/\b\d{6}\b/);
  return match?.[0] ?? null;
}

function extractBusinessType(text: string, name: string): string | null {
  const combined = `${name}\n${text}`;
  const patterns = [
    /\b(manufacturer|supplier|trader|dealer|distributor|retailer|contractor|architect|interior designer|builder|service provider|company|firm|studio)\b/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[0]) return match[0];
  }

  return null;
}

function normalizePhone(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/(?<=\d)\s+(?=\d)/g, '')
    .trim();
}

function extractAddress(
  text: string,
  addressElements: string[],
): string | null {
  const elementAddress = addressElements
    .map((address) => normalizeWhitespace(address))
    .find((address) => address.length >= 10);

  if (elementAddress) {
    return elementAddress;
  }

  const labelMatch = text.match(
    /(?:registered\s+office|office\s+address|address|location)\s*[:\-]\s*([^\n]{10,200})/i,
  );

  return labelMatch
    ? normalizeWhitespace(labelMatch[1])
    : null;
}

function extractGstin(text: string): string | null {
  const gstinMatch = text.match(
    /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i,
  );

  return gstinMatch?.[0].toUpperCase() ?? null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractSocialProfiles(
  links: { href: string; text: string }[],
): ContactExtraction['socialProfiles'] {
  const platforms = [
    'instagram.com',
    'facebook.com',
    'linkedin.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'tiktok.com',
  ];

  return links
    .filter((link) => {
      try {
        const hostname = new URL(link.href).hostname.toLowerCase();

        return platforms.some((platform) =>
          hostname.includes(platform),
        );
      } catch {
        return false;
      }
    })
    .map((link) => ({
      platform: getSocialPlatform(link.href),
      url: link.href,
    }))
    .filter(
      (profile, index, profiles) =>
        profiles.findIndex(
          (item) => item.url === profile.url,
        ) === index,
    );
}

function getSocialPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('facebook.com')) return 'facebook';
  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('twitter.com')) return 'twitter';
  if (hostname.includes('x.com')) return 'x';
  if (hostname.includes('youtube.com')) return 'youtube';
  if (hostname.includes('tiktok.com')) return 'tiktok';

  return 'other';
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}