/**
 * LOCAL ONLY: neutralize real email addresses in the local hrms DB so no real
 * person receives notifications during local testing. Inserts "1" before the
 * "@" in users.email, employees.email, employees.personalEmail.
 *
 * Guard: refuses to run against anything other than a localhost MONGO_URI.
 * Idempotent-ish: skips a value whose local part already ends in "1".
 *
 *   node scripts/mangleLocalEmails.js
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

const local = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));
const URI = local.MONGO_URI;
const DB = local.DB_NAME || 'hrms';

if (!/localhost|127\.0\.0\.1/.test(URI || '')) {
  console.error(`Refusing to run: MONGO_URI is not local -> ${URI}`);
  process.exit(1);
}

function mangle(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  const at = email.lastIndexOf('@');
  const localPart = email.slice(0, at);
  const domain = email.slice(at); // includes @
  if (localPart.endsWith('1')) return null; // already mangled
  return `${localPart}1${domain}`;
}

async function main() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB);

  // users.email  (also the login email — captured for reference)
  const userMap = [];
  for (const u of await db.collection('users').find({ email: { $ne: null } }).toArray()) {
    const next = mangle(u.email);
    if (!next) continue;
    await db.collection('users').updateOne({ _id: u._id }, { $set: { email: next } });
    userMap.push({ from: u.email, to: next });
  }

  // employees.email + employees.personalEmail
  let empEmail = 0, empPersonal = 0;
  for (const e of await db.collection('employees').find({}).toArray()) {
    const set = {};
    const a = mangle(e.email);
    const b = mangle(e.personalEmail);
    if (a) { set.email = a; empEmail++; }
    if (b) { set.personalEmail = b; empPersonal++; }
    if (Object.keys(set).length) await db.collection('employees').updateOne({ _id: e._id }, { $set: set });
  }

  console.log('=== users.email (use these to log in now) ===');
  userMap.forEach(m => console.log(`${m.from}  ->  ${m.to}`));
  console.log(`\nusers.email updated:            ${userMap.length}`);
  console.log(`employees.email updated:        ${empEmail}`);
  console.log(`employees.personalEmail updated:${empPersonal}`);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
