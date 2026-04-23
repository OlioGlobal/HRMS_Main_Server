/**
 * Reverse geocode employee address coordinates → fill city, state, zip, country
 * Uses OpenStreetMap Nominatim (free, 1 req/sec limit)
 */

require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');
const https    = require('https');

const Company  = require('../src/models/Company');
const Employee = require('../src/models/Employee');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'HRMS-OlioGlobal/1.0 (internal use)' }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const data = await fetchJSON(url);
  if (!data || !data.address) return null;

  const a = data.address;
  const city    = a.city || a.town || a.village || a.suburb || a.county || null;
  const state   = a.state || null;
  const zip     = a.postcode || null;
  const country = a.country || null;

  return { city, state, zip, country };
}

async function run() {
  console.log('Connecting to PROD…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  const company = await Company.findOne({ name: /olio/i }).lean();
  const cid     = company._id;

  // Load employees that have addresses with lat/lng
  const emps = await Employee.find({
    company_id: cid,
    'addresses.0': { $exists: true }
  }).lean();

  console.log(`Found ${emps.length} employees with addresses.\n`);

  for (const emp of emps) {
    const updatedAddresses = [];
    let changed = false;

    for (const addr of emp.addresses) {
      if (!addr.lat || !addr.lng) {
        updatedAddresses.push(addr);
        continue;
      }

      process.stdout.write(`  Geocoding ${emp.employeeId} — "${addr.street}" (${addr.lat}, ${addr.lng})… `);
      await sleep(1100); // Nominatim rate limit: 1 req/sec

      try {
        const geo = await reverseGeocode(addr.lat, addr.lng);
        if (geo) {
          updatedAddresses.push({ ...addr, city: geo.city, state: geo.state, zip: geo.zip, country: geo.country });
          console.log(`${geo.city}, ${geo.state}, ${geo.zip}, ${geo.country}`);
          changed = true;
        } else {
          updatedAddresses.push(addr);
          console.log('no result');
        }
      } catch (e) {
        updatedAddresses.push(addr);
        console.log('error: ' + e.message);
      }
    }

    if (changed) {
      await Employee.updateOne({ _id: emp._id }, { $set: { addresses: updatedAddresses } });
    }
  }

  console.log('\nAll addresses geocoded.');
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
