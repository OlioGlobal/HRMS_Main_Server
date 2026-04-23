/**
 * Update employee home addresses with lat/lng coordinates
 */

require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');
const Company  = require('../src/models/Company');
const Employee = require('../src/models/Employee');

// Multiple addresses per employee → first is primary
const ADDRESS_DATA = {
  'OLIO-003': [
    { street: "Vishwas's Home",       lat: 18.984096,  lng: 72.8389518 },
    { street: "Vishwas's Wai Home",   lat: 17.9574243, lng: 73.8755106 },
  ],
  'OLIO-004': [
    { street: "Sagar's Home",         lat: 19.1934076, lng: 73.0835311 },
    { street: "Sagar's Koregaon Home",lat: 17.6967609, lng: 74.1602353 },
    { street: "Sagar's Kutch Home",   lat: 22.8796794, lng: 69.5819977 },
  ],
  'OLIO-011': [
    { street: "Pradeep Home's",       lat: 25.383225,  lng: 72.970766  },
  ],
  'OLIO-013': [
    { street: "Manish's Home",        lat: 27.5715217, lng: 78.0577514 },
  ],
  'OLIO-019': [
    { street: "Suraj's Home",         lat: 18.9804437, lng: 73.094393  },
  ],
  'OLIO-033': [
    { street: "Kiran's Home",         lat: 16.7428684, lng: 74.2471624 },
    { street: "Kiran's Home - 2",     lat: 16.1553165, lng: 75.6434574 },
  ],
  'OLIO-039': [
    { street: "Aniket's Home",        lat: 19.1632437, lng: 73.2261352 },
  ],
  'OLIO-045': [
    { street: "Shaun's Home",         lat: 19.1162577, lng: 72.9323199 },
  ],
  'OLIO-045A': [
    { street: "Sarita Home",          lat: 19.173101,  lng: 73.0669361 },
  ],
  'OLIO-047': [
    { street: "Charul's Home",        lat: 19.2003161, lng: 72.9943239 },
  ],
  'OLIO-048': [
    { street: "Shobha's Home",        lat: 18.9819999, lng: 72.8411021 },
  ],
  'OLIO-049': [
    { street: "Himesh's Home",        lat: 19.9553521, lng: 72.6877252 },
  ],
  'OLIO-050': [
    { street: "Kshitij's Home",       lat: 19.1649674, lng: 72.9548251 },
  ],
  'OLIO-055': [
    { street: "Yash's Home",          lat: 20.896563,  lng: 74.786411  },
  ],
  'OLIO-056': [
    { street: "Prashant's Home",      lat: 16.7430225, lng: 74.246834  },
    { street: "Prashant's Home - 2",  lat: 16.155375,  lng: 75.6436821 },
  ],
  'OLIO-057': [
    { street: "Saurabh's Home",       lat: 22.698324,  lng: 75.8568631 },
    { street: "Saurabh's New Home",   lat: 22.6781312, lng: 75.8417811 },
  ],
  'OLIO-058': [
    { street: "Divya's Home",         lat: 19.1562856, lng: 72.9219553 },
  ],
  'OLIO-060': [
    { street: "Reshma's Pune Home",   lat: 18.5184294, lng: 73.9733242 },
    { street: "Reshma's Mumbai Home", lat: 19.016087,  lng: 72.8594296 },
    { street: "Reshma's Home",        lat: 17.4575969, lng: 74.4674217 },
  ],
  'OLIO-061': [
    { street: "Muskan's Home",        lat: 19.1101759, lng: 72.881781  },
    { street: "Muskan's Kota Home",   lat: 25.1752207, lng: 75.8658037 },
    { street: "Muskan Home",          lat: 19.0994248, lng: 72.8860061 },
  ],
  'OLIO-062': [
    { street: "Mitali's Home",        lat: 19.2315502, lng: 73.1340065 },
    { street: "Mitali's New Home",    lat: 19.2071037, lng: 73.1271172 },
  ],
  'OLIO-064': [
    { street: "Khushi's Home",        lat: 19.2224767, lng: 73.085485  },
  ],
  'OLIO-065': [
    { street: "ITpreneur's Office",   lat: 18.519793,  lng: 73.8409057 },
    { street: "Tanvi Pune Office",    lat: 18.5199451, lng: 73.8423424 },
    { street: "Tanvi Gujrat Home",    lat: 22.2397794, lng: 73.2009397 },
  ],
  'OLIO-066': [
    { street: "Anchal's Home",        lat: 19.0154963, lng: 73.0361387 },
    { street: "Anchal's Home 2",      lat: 19.059691,  lng: 73.1050259 },
  ],
  'OLIO-068': [
    { street: "Rajesh's Home",        lat: 18.5978499, lng: 73.8133326 },
  ],
  'OLIO-069': [
    { street: "Mandar's Home",        lat: 19.0716032, lng: 72.8992075 },
  ],
  'OLIO-070': [
    { street: "Vinita's Home",        lat: 19.0965135, lng: 72.9035726 },
  ],
  'OLIO-071': [
    { street: "Rahul's Home",         lat: 19.2076851, lng: 72.953758  },
  ],
  'OLIO-072': [
    { street: "Ayaan's Home",         lat: 19.0777544, lng: 72.8858327 },
  ],
  'OLIO-073': [
    { street: "Shripad's Home",       lat: 18.6724985, lng: 73.7262577 },
  ],
};

async function run() {
  console.log('Connecting to PROD…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  const company = await Company.findOne({ name: /olio/i }).lean();
  const cid     = company._id;

  let updated = 0, skipped = 0;

  for (const [empId, addrs] of Object.entries(ADDRESS_DATA)) {
    const emp = await Employee.findOne({ company_id: cid, employeeId: empId }).lean();
    if (!emp) { console.log(`  ⚠ ${empId} not found`); skipped++; continue; }

    const addresses = addrs.map((a, i) => ({
      label:     'home',
      street:    a.street,
      city:      null,
      state:     null,
      country:   'India',
      zip:       null,
      lat:       a.lat,
      lng:       a.lng,
      isPrimary: i === 0,
    }));

    await Employee.updateOne({ _id: emp._id }, { $set: { addresses } });
    console.log(`  ✓ ${empId.padEnd(10)} ${(emp.firstName + ' ' + emp.lastName).padEnd(28)} ${addrs.length} address(es)`);
    updated++;
  }

  console.log(`\nUpdated: ${updated} | Skipped: ${skipped}`);
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
