# Lead Discovery

A Node.js tool for discovering business leads in a specific category and location.

The tool searches the web, crawls relevant websites, extracts contact information, removes duplicates, and exports the leads to Excel.

## Features

* Web-based lead discovery
* Website crawling with Crawlee and Playwright
* Contact extraction
* Email and phone extraction
* Company and address extraction
* GSTIN extraction
* Social media profile extraction
* Duplicate lead detection
* Excel export
* CSV export
* CLI support
* Error handling and retry support

## Tech Stack

* Node.js
* TypeScript
* Crawlee
* Playwright
* Tavily API
* ExcelJS
* dotenv

## Requirements

* Node.js 18+
* npm
* Tavily API key

## Installation

Clone or open the project and install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
TAVILY_API_KEY=your_api_key_here
```

## Run the Tool

Basic search:

```bash
npm start --category architect --location Hyderabad
```

Other examples:

```bash
npm start --category contractor --location Hyderabad
```

```bash
npm start --category "civil engineer" --location Hyderabad
```

Enable detailed logs:

```bash
npm start --category architect --location Hyderabad --verbose
```

Export CSV also:

```bash
npm start --category architect --location Hyderabad --csv
```

Show the browser while crawling:

```bash
npm start --category architect --location Hyderabad --no-headless
```

## Lead Data

The tool can extract:

* Name
* Company Name
* Mobile
* Landline
* Email
* Category
* Location
* Address
* GSTIN
* Website
* LinkedIn
* Instagram
* Facebook
* X
* YouTube
* Source
* Source URL

## Categories

The project supports construction and building-related categories such as:

### Professionals

* Architects
* Builders
* Contractors
* Interior Designers
* Civil Engineers

### Product Suppliers

* Tile
* Cement
* Steel
* Paint
* Solar
* Sanitary Ware
* Bricks and Blocks
* Roofing
* Precast
* Lighting
* Plumbing
* Furniture
* Electricals
* Door and Window Accessories

Categories are managed in:

```text
config/lead-discovery-categories.ts
```

## Lead Qualification

A lead is considered useful when it has at least one contact method:

* Mobile **OR**
* Email

Records without both mobile and email can be rejected.

## Output

Generated files are stored in:

```text
output/
```

Example:

```text
output/
├── leads-architect-hyderabad.xlsx
└── leads-architect-hyderabad.csv
```

The Excel file contains the extracted lead information in a structured format.

## Project Structure

```text
lead-discovery/
├── src/
│   ├── config/
│   ├── crawler/
│   ├── discovery/
│   ├── export/
│   ├── extractors/
│   ├── types/
│   └── utils/
├── output/
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

## Development

Check TypeScript:

```bash
npx tsc --noEmit
```

Run the application:

```bash
npx tsx src/index.ts
```

## Notes

The tool is designed for lead discovery. Search results and extracted contact information depend on the websites and search providers available at the time of the search.

For detailed technical documentation, see the other project documentation files.
