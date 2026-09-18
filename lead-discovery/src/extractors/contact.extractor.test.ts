import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chromium } from 'playwright';

import { extractContactInformation } from './contact.extractor.js';

describe('extractContactInformation', () => {
  it('extracts business name and landline from page content', async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.setContent(`
        <html>
          <head>
            <title>ABC Builders Pvt Ltd | Hyderabad</title>
          </head>
          <body>
            <h1>ABC Builders Pvt Ltd</h1>
            <p>Call: 040-2345-6789</p>
            <p>Mobile: +91 98765 43210</p>
            <p>Email: hello@abcbuilders.in</p>
          </body>
        </html>
      `);

      const contact = await extractContactInformation(page);

      assert.equal(contact.name, 'ABC Builders Pvt Ltd');
      assert.equal(contact.landline, '040-2345-6789');
      assert.deepEqual(contact.phones, ['040-2345-6789', '+91 98765 43210']);
      assert.deepEqual(contact.emails, ['hello@abcbuilders.in']);
    } finally {
      await browser.close();
    }
  });
});
