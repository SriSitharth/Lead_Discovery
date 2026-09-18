export interface LeadSearchInput {
  category: string;
  location: string;
}

export interface Lead {
  companyName: string | null;
  contactPerson: string | null;

  mobile: string | null;
  alternatePhone: string | null;
  landline: string | null;
  whatsapp: string | null;
  email: string | null;

  category: string | null;
  searchSubcategory: string | null;
  location: string | null;
  city: string | null;
  pincode: string | null;
  address: string | null;
  gstin: string | null;
  businessType: string | null;

  website: string | null;

  linkedin: string | null;
  instagram: string | null;
  facebook: string | null;
  x: string | null;
  youtube: string | null;

  source: string | null;
  sourceUrl: string | null;
  lastUpdated: string | null;
}