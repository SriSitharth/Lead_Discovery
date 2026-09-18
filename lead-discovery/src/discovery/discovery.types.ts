export interface DiscoveryResult {
  title: string;
  url: string;
  snippet: string | null;
  searchSubcategory: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  source?: string;
}