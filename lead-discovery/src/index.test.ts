import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { describe, it } from 'node:test';

import ExcelJS from 'exceljs';

import {
  resolveCompanyName,
  resolveLeadSource,
} from './crawler/website-crawler.js';
import { exportLeadsToExcel } from './export/excel.exporter.js';
import { runLeadDiscovery } from './index.js';

describe('runLeadDiscovery', () => {
  it('assigns each crawled lead to the category currently being processed', async () => {
    const exportedLeads: string[] = [];

    await runLeadDiscovery({
      location: 'Hyderabad',
      categoryFilter: 'PROFESSIONALS',
      discoveryFactory: async (category) => ({
        search: async () => [{
          title: category,
          url: `https://example.com/${category}`,
          snippet: null,
          searchSubcategory: category,
        }],
      }),
      crawlerFactory: async () => [{
        name: 'Sample Lead',
        companyName: 'Sample Company',
        contactPerson: null,
        mobile: '+919999999999',
        alternatePhone: null,
        landline: null,
        whatsapp: null,
        email: null,
        category: 'incorrect-category',
        searchSubcategory: 'Builders',
        location: 'Hyderabad',
        city: 'Hyderabad',
        pincode: null,
        address: null,
        gstin: null,
        businessType: null,
        website: 'https://example.com/sample',
        linkedin: null,
        instagram: null,
        facebook: null,
        x: null,
        youtube: null,
        source: 'test',
        sourceUrl: 'https://example.com/sample',
        lastUpdated: new Date().toISOString(),
      }],
      exportLeads: async (leads) => {
        exportedLeads.push(...leads.map((lead) => lead.category ?? ''));
        return 'output/test.xlsx';
      },
    });

    assert.deepEqual(exportedLeads.slice(-4), [
      'Builders',
      'Contractors',
      'Interior Designers',
      'Civil Engineers',
    ]);
  });

  it('continues past a failed category and still exports extracted leads', async () => {
    const exports: Array<{
      leads: number;
      errors: number;
      path: string;
    }> = [];
    let categoryCount = 0;

    const result = await runLeadDiscovery({
      location: 'Hyderabad',
      categoryFilter: 'all',
      discoveryFactory: async (category) => ({
        search: async () => {
          if (category === 'Builders') {
            return [{
              title: 'Builder 1',
              url: 'https://example.com/builder',
              snippet: 'test',
              searchSubcategory: 'Fine Dining',
            }];
          }

          throw new Error('simulated discovery failure');
        },
      }),
      crawlerFactory: async (results, category) => {
        if (category === 'Builders') {
          return [{
            name: 'Sample Lead',
            companyName: 'Sample Company',
            contactPerson: 'Mr. Rao',
            mobile: '+919999999999',
            alternatePhone: null,
            landline: null,
            whatsapp: '+919999999999',
            email: 'sample@example.com',
            category,
            searchSubcategory: results[0]?.searchSubcategory ?? null,
            location: 'Hyderabad',
            city: 'Hyderabad',
            pincode: '500001',
            address: 'Hyderabad',
            gstin: null,
            businessType: 'manufacturer',
            website: results[0]?.url ?? null,
            linkedin: null,
            instagram: null,
            facebook: null,
            x: null,
            youtube: null,
            source: 'Tavily',
            sourceUrl: results[0]?.url ?? null,
            lastUpdated: new Date().toISOString(),
          }];
        }

        throw new Error('simulated crawler failure');
      },
      exportLeads: async (leads, location, categories, errors) => {
        assert.equal(location, 'Hyderabad');
        assert.equal(categories.length > 0, true);
        categoryCount = categories.length;
        exports.push({
          leads: leads.length,
          errors: errors.length,
          path: `output/${location}-partial.xlsx`,
        });
        return exports.at(-1)!.path;
      },
    });

    assert.equal(exports.length, categoryCount);
    assert.equal(exports.some((entry) => entry.leads === 1), true);
    assert.equal(exports.at(-1)!.leads, 1);
    assert.equal(exports.at(-1)!.errors, categoryCount - 1);
    assert.equal(result.exportedPath, 'output/Hyderabad-partial.xlsx');
    assert.equal(result.leads.length, 1);
    assert.equal(result.errors.length, categoryCount - 1);
  });

  it('keeps the actual discovery source instead of defaulting to Tavily', () => {
    assert.equal(resolveLeadSource({ source: 'SearXNG' }), 'SearXNG');
    assert.equal(resolveLeadSource({ source: ' OpenStreetMap ' }), 'OpenStreetMap');
    assert.equal(resolveLeadSource(null, 'Unknown'), 'Unknown');
    assert.equal(resolveLeadSource({ source: '   ' }, 'Unknown'), 'Unknown');
  });

  it('ignores generic directory titles and keeps real company names', () => {
    assert.equal(
      resolveCompanyName('Top 10 Builders in Hyderabad', 'ABC Builders Pvt Ltd'),
      'ABC Builders Pvt Ltd',
    );
    assert.equal(
      resolveCompanyName('Builders in Hyderabad', null),
      null,
    );
    assert.equal(
      resolveCompanyName('ABC Builders Pvt Ltd', null),
      'ABC Builders Pvt Ltd',
    );
  });

  it('omits the location column and leaves the subcategory cells unhighlighted', async () => {
    const filePath = await exportLeadsToExcel([
      {
        companyName: 'Sample Company',
        contactPerson: 'Mr. Rao',
        mobile: '+919999999999',
        alternatePhone: null,
        landline: null,
        whatsapp: '+919999999999',
        email: 'sample@example.com',
        category: 'Builders',
        searchSubcategory: 'Fine Dining',
        location: 'Hyderabad',
        city: 'Hyderabad',
        pincode: '500001',
        address: 'Hyderabad',
        gstin: null,
        businessType: 'manufacturer',
        website: 'https://example.com/builder',
        linkedin: null,
        instagram: null,
        facebook: null,
        x: null,
        youtube: null,
        source: 'Tavily',
        sourceUrl: 'https://example.com/builder',
        lastUpdated: new Date().toISOString(),
      },
    ], 'Hyderabad', ['Builders']);

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet('Builders');
      assert.ok(worksheet);
      assert.equal(worksheet.columns.some((column) => column.key === 'location'), false);
      assert.equal(worksheet.getCell('J2').fill, undefined);
      assert.equal(worksheet.getCell('J2').font?.bold, undefined);
    } finally {
      await fs.rm(filePath, { force: true });
    }
  });
});
