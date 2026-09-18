const LOCATION_AREAS: Record<string, string[]> = {
  hyderabad: [
    'Banjara Hills',
    'Jubilee Hills',
    'Madhapur',
    'Kondapur',
    'Gachibowli',
    'Kukatpally',
    'Hitech City',
    'Begumpet',
    'Somajiguda',
    'Punjagutta',
    'Ameerpet',
    'Secunderabad',
    'Manikonda',
    'Narsingi',
    'Kokapet',
    'Financial District',
    'Mehdipatnam',
    'Tolichowki',
    'Attapur',
    'Dilsukhnagar',
    'LB Nagar',
    'Uppal',
    'Kompally',
    'Bowenpally',
    'Alwal',
    'Tarnaka',
    'Nacharam',
    'Malakpet',
    'Himayat Nagar',
    'Basheerbagh',
    'Khairatabad',
    'Masab Tank',
    'Rajendra Nagar',
    'Shamshabad',
  ],

  bangalore: [
    'Koramangala',
    'Indiranagar',
    'HSR Layout',
    'Whitefield',
    'Marathahalli',
    'Electronic City',
    'Jayanagar',
    'JP Nagar',
    'BTM Layout',
    'Malleshwaram',
    'Rajajinagar',
    'Yelahanka',
    'Hebbal',
    'Banashankari',
    'Basavanagudi',
    'Sadashivanagar',
    'Frazer Town',
    'Richmond Town',
    'Ulsoor',
    'Bellandur',
    'Sarjapur Road',
    'Hennur',
    'Kalyan Nagar',
    'Brookefield',
    'Devanahalli',
  ],
};

export function generateSearchQueries(
  category: string,
  location: string,
): string[] {
  const normalizedLocation = location.trim().toLowerCase();

  const areas = LOCATION_AREAS[normalizedLocation];

  // If we don't have a predefined area list for the location,
  // fall back to general location-based queries.
  if (!areas) {
    return generateGeneralQueries(category, location);
  }

  const queries: string[] = [];

  for (const area of areas) {
    queries.push(
      `${category} in ${area} ${location}`,
      `${category} firms in ${area} ${location}`,
      `${category} companies in ${area} ${location}`,
      `${category} consultants in ${area} ${location}`,
      `${category} contact ${area} ${location}`,
    );
  }

  // Also search the whole city.
  queries.push(
    `${category} in ${location}`,
    `${category} firms in ${location}`,
    `${category} companies in ${location}`,
    `${category} consultants in ${location}`,
    `${category} businesses in ${location}`,
  );

  return [...new Set(queries)];
}

function generateGeneralQueries(
  category: string,
  location: string,
): string[] {
  return [
    `${category} in ${location}`,
    `${category} ${location}`,
    `${category} companies in ${location}`,
    `${category} firms in ${location}`,
    `${category} consultants in ${location}`,
    `${category} services in ${location}`,
    `${category} professionals in ${location}`,
    `${category} businesses in ${location}`,
    `${category} agencies in ${location}`,
    `${category} studios in ${location}`,
    `${category} offices in ${location}`,
    `${category} contact ${location}`,
    `${category} phone ${location}`,
    `${category} email ${location}`,
  ];
}