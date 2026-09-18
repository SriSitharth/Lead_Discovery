import ExcelJS from 'exceljs';

import type { Lead } from '../types/search.types.js';
import { leadDiscoveryConfig } from '../config/lead-discovery-categories.js';

export interface ExcelExportError {
  category: string;
  message: string;
}

// Maps a specific category name (e.g. "Builders") to its broader group
// (e.g. "PROFESSIONALS"), so the exported "Category" column can show the
// group while worksheets stay split per specific category.
const CATEGORY_NAME_TO_GROUP = new Map<string, string>(
  leadDiscoveryConfig.leadCategories.map((category) => [
    category.name,
    category.group,
  ]),
);

function resolveCategoryGroup(categoryName: string | null): string {
  if (!categoryName) return '';
  return CATEGORY_NAME_TO_GROUP.get(categoryName) ?? categoryName;
}

interface ColumnDef {
  header: string;
  key: string;
  width: number;
}

// Full column set, used when at least one lead in the sheet has data that
// only comes from crawling the business website (email, socials, etc.).
const FULL_COLUMN_HEADERS: ColumnDef[] = [
  { header: 'Company Name', key: 'companyName', width: 35 },
  { header: 'Contact Person', key: 'contactPerson', width: 28 },
  { header: 'Mobile', key: 'mobile', width: 20 },
  { header: 'Alternate Phone', key: 'alternatePhone', width: 20 },
  { header: 'Landline', key: 'landline', width: 20 },
  { header: 'WhatsApp', key: 'whatsapp', width: 20 },
  { header: 'Email', key: 'email', width: 38 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Search Subcategory', key: 'searchSubcategory', width: 28 },
  { header: 'City', key: 'city', width: 20 },
  { header: 'Pincode', key: 'pincode', width: 12 },
  { header: 'Address', key: 'address', width: 45 },
  { header: 'GSTIN', key: 'gstin', width: 20 },
  { header: 'Business Type', key: 'businessType', width: 20 },
  { header: 'Website', key: 'website', width: 50 },
  { header: 'LinkedIn', key: 'linkedin', width: 50 },
  { header: 'Instagram', key: 'instagram', width: 50 },
  { header: 'Facebook', key: 'facebook', width: 50 },
  { header: 'X', key: 'x', width: 40 },
  { header: 'YouTube', key: 'youtube', width: 50 },
  { header: 'Source', key: 'source', width: 20 },
  { header: 'Source URL', key: 'sourceUrl', width: 50 },
  { header: 'Last Updated', key: 'lastUpdated', width: 24 },
];

// Reduced column set for leads that come straight from a structured
// discovery API (e.g. Google Places) with no website crawl, so fields that
// would always be blank (email, socials, website, etc.) aren't shown.
const MINIMAL_COLUMN_HEADERS: ColumnDef[] = [
  { header: 'Company Name', key: 'companyName', width: 35 },
  { header: 'Mobile', key: 'mobile', width: 20 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Search Subcategory', key: 'searchSubcategory', width: 28 },
  { header: 'City', key: 'city', width: 20 },
  { header: 'Address', key: 'address', width: 45 },
  { header: 'Source', key: 'source', width: 20 },
  { header: 'Source URL', key: 'sourceUrl', width: 50 },
  { header: 'Last Updated', key: 'lastUpdated', width: 24 },
];

// Fields that are only ever populated by crawling a business website.
// If no lead in a sheet has any of these, the sheet uses the minimal columns.
const CRAWL_ONLY_KEYS: Array<keyof Lead> = [
  'contactPerson',
  'alternatePhone',
  'landline',
  'whatsapp',
  'email',
  'pincode',
  'gstin',
  'businessType',
  'website',
  'linkedin',
  'instagram',
  'facebook',
  'x',
  'youtube',
];

function hasCrawledData(categoryLeads: Lead[]): boolean {
  return categoryLeads.some((lead) =>
    CRAWL_ONLY_KEYS.some((key) => {
      const value = lead[key];
      return typeof value === 'string' && value.trim().length > 0;
    }),
  );
}

function detectColumnSet(worksheet: ExcelJS.Worksheet): ColumnDef[] {
  const headerTexts = new Set<string>();
  worksheet.getRow(1).eachCell((cell) => headerTexts.add(getCellText(cell.value)));
  return headerTexts.has('Email') ? FULL_COLUMN_HEADERS : MINIMAL_COLUMN_HEADERS;
}

function columnIndex(columns: ColumnDef[], key: string): number | undefined {
  const index = columns.findIndex((column) => column.key === key);
  return index === -1 ? undefined : index + 1;
}

function getCellValueByKey(
  columns: ColumnDef[],
  row: ExcelJS.Row,
  key: string,
): string {
  const index = columnIndex(columns, key);
  return index ? getCellText(row.getCell(index).value) : '';
}

function getLeadFieldValue(lead: Lead, key: string): string {
  if (key === 'lastUpdated') {
    return formatLastUpdatedTimestamp(
      lead.lastUpdated ? new Date(lead.lastUpdated) : new Date(),
    );
  }

  // The "Category" column shows the broader group (e.g. "PROFESSIONALS")
  // rather than the specific category name; worksheets are still split
  // per specific category (see leadsByCategory below).
  if (key === 'category') {
    return resolveCategoryGroup(lead.category);
  }

  const value = (lead as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export async function exportLeadsToExcel(
  leads: Lead[],
  location: string,
  categories: string[] = [],
  errors: ExcelExportError[] = [],
): Promise<string> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const outputDirectory = 'output';
  const safeLocation = location
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  const filePath = path.join(
    outputDirectory,
    `leads-${safeLocation}.xlsx`,
  );

  await fs.mkdir(outputDirectory, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const existingKeysBySheet = new Map<string, Set<string>>();
  const columnsBySheet = new Map<string, ColumnDef[]>();

  try {
    await workbook.xlsx.readFile(filePath);
    for (const worksheet of workbook.worksheets) {
      if (worksheet.name === 'Errors') continue;
      const columns = detectColumnSet(worksheet);
      columnsBySheet.set(worksheet.name, columns);

      const existingKeys = new Set<string>();
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const key = buildLeadIdentityKey({
          mobile: getCellValueByKey(columns, row, 'mobile'),
          email: getCellValueByKey(columns, row, 'email'),
          companyName: getCellValueByKey(columns, row, 'companyName'),
          website: getCellValueByKey(columns, row, 'website'),
        });

        if (key) {
          existingKeys.add(key);
        }
      }
      existingKeysBySheet.set(worksheet.name, existingKeys);
    }
  } catch {
    // No existing file yet; start from a fresh workbook.
  }

  const leadsByCategory = new Map<string, Lead[]>();

  for (const category of categories) {
    leadsByCategory.set(category, []);
  }

  for (const lead of leads) {
    const category = lead.category ?? 'Uncategorized';
    const categoryLeads = leadsByCategory.get(category) ?? [];

    categoryLeads.push(lead);
    leadsByCategory.set(category, categoryLeads);
  }

  for (const [category, categoryLeads] of leadsByCategory) {
    const sheetName = toSheetName(category);
    let worksheet = workbook.getWorksheet(sheetName);
    const isNewSheet = !worksheet;
    
    if (isNewSheet) {
      worksheet = workbook.addWorksheet(sheetName);
    }

    if (!worksheet) {
      throw new Error(`Failed to create or get worksheet for category: ${category}`);
    }

    // Decide which column set this sheet uses. New sheets pick based on
    // whether any lead in this batch has crawl-derived data; existing sheets
    // keep whatever layout they already have.
    let columns = columnsBySheet.get(sheetName);
    if (isNewSheet) {
      columns = hasCrawledData(categoryLeads)
        ? FULL_COLUMN_HEADERS
        : MINIMAL_COLUMN_HEADERS;
      worksheet.columns = columns;
      columnsBySheet.set(sheetName, columns);
    } else if (!columns) {
      columns = detectColumnSet(worksheet);
      columnsBySheet.set(sheetName, columns);
    }

    // Always get existing keys for this sheet
    let existingKeys = existingKeysBySheet.get(sheetName);
    if (!existingKeys) {
      existingKeys = new Set<string>();
      // If this is an existing sheet that wasn't loaded (shouldn't happen), populate it
      if (!isNewSheet && worksheet.rowCount > 1) {
        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const key = buildLeadIdentityKey({
            mobile: getCellValueByKey(columns, row, 'mobile'),
            email: getCellValueByKey(columns, row, 'email'),
            companyName: getCellValueByKey(columns, row, 'companyName'),
            website: getCellValueByKey(columns, row, 'website'),
          });
          if (key) {
            existingKeys.add(key);
          }
        }
      }
      existingKeysBySheet.set(sheetName, existingKeys);
    }

    for (const lead of categoryLeads) {
      const identityKey = buildLeadIdentityKey(lead);
      if (!identityKey || existingKeys.has(identityKey)) {
        continue;
      }

      // Add row by directly setting cell values to ensure proper persistence
      const rowNum = worksheet.rowCount + 1;
      const row = worksheet.getRow(rowNum);

      row.values = columns.map((column) => getLeadFieldValue(lead, column.key));

      row.commit();

      existingKeys.add(identityKey);
    }

    // Format the sheet if it has content
    if (worksheet.rowCount > 1) {
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: 'A1',
        to: `${columnNumberToLetter(columns.length)}1`,
      };
      worksheet.eachRow((row) => {
        row.alignment = { vertical: 'top', wrapText: true };
      });
    }
  }

  if (errors.length > 0) {
    const existingErrorSheet = workbook.getWorksheet('Errors');
    if (existingErrorSheet) {
      workbook.removeWorksheet(existingErrorSheet.id);
    }

    const errorSheet = workbook.addWorksheet('Errors');
    errorSheet.columns = [
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Error', key: 'error', width: 120 },
    ];

    for (const error of errors) {
      errorSheet.addRow({
        category: error.category,
        error: error.message,
      });
    }

    errorSheet.getRow(1).font = { bold: true };
    errorSheet.views = [{ state: 'frozen', ySplit: 1 }];
    errorSheet.autoFilter = {
      from: 'A1',
      to: 'B1',
    };
  }

  try {
    await workbook.xlsx.writeFile(filePath);
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    // If file is locked, retry a few times with delays
    if (errorCode === 'EBUSY' || errorCode === 'EPERM') {
      let retries = 3;
      let lastError = error;

      while (retries > 0) {
        try {
          console.warn(
            `File is locked (${errorCode}). Retrying in 2 seconds... (${retries} attempts left)`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await workbook.xlsx.writeFile(filePath);
          console.log('✅ Successfully wrote file after retry');
          return filePath;
        } catch (retryError) {
          lastError = retryError;
          retries -= 1;
        }
      }

      // If all retries failed, create fallback file
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);
      const fallbackPath = path.join(
        outputDirectory,
        `leads-${safeLocation}-${timestamp}.xlsx`,
      );

      await workbook.xlsx.writeFile(fallbackPath);
      console.warn(
        `Could not update ${filePath} after retries because the file is locked by another process. Wrote the latest data to ${fallbackPath}.\n\nTo fix this:\n1. Close the Excel file: ${filePath}\n2. Delete the fallback file: ${fallbackPath}\n3. Run again`,
      );
      return fallbackPath;
    }

    // For other errors, throw immediately
    throw error;
  }

  return filePath;
}

function formatLastUpdatedTimestamp(date: Date | string | null): string {
  const targetDate = date ? new Date(date) : new Date();

  if (Number.isNaN(targetDate.getTime())) {
    return '';
  }

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())} ${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}:${pad(targetDate.getSeconds())}`;
}

function columnNumberToLetter(columnNumber: number): string {
  let result = '';
  let current = columnNumber;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function buildLeadIdentityKey(
  lead: Partial<Pick<Lead, 'mobile' | 'email' | 'companyName' | 'website'>>,
): string {
  const combined = [
    normalizeKey(lead.mobile),
    normalizeKey(lead.email),
    normalizeKey(lead.companyName),
    normalizeKey(lead.website),
  ]
    .filter(Boolean)
    .join('|');

  return combined || '';
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '');
  }
  return String(value);
}

function toSheetName(category: string): string {
  const sheetName = category
    .replace(/[\\/*?:[\]]/g, '-')
    .trim()
    .slice(0, 31);

  return sheetName || 'Uncategorized';
}