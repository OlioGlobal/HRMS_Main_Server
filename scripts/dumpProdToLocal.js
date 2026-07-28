/**
 * One-off: copy the entire prod `hrms` database (MongoDB Atlas) into the local
 * MongoDB instance. Source is read from .env.production, destination from .env.
 * Destination collections are dropped first, so this is a clean overwrite.
 *
 *   node scripts/dumpProdToLocal.js
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

const prod = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.production')));
const local = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));

const SRC_URI = prod.MONGO_URI;
const DEST_URI = local.MONGO_URI;
const DEST_DB = local.DB_NAME || 'hrms';

async function main() {
  if (!SRC_URI) throw new Error('MONGO_URI missing in .env.production');
  if (!DEST_URI) throw new Error('MONGO_URI missing in .env');

  const src = new MongoClient(SRC_URI);
  const dst = new MongoClient(DEST_URI);
  await src.connect();
  await dst.connect();

  const srcDb = src.db();          // db from the Atlas URI path (hrms)
  const dstDb = dst.db(DEST_DB);   // local URI has no db path, pass it explicitly

  console.log(`Source: ${srcDb.databaseName}  ->  Dest: ${DEST_URI} / ${dstDb.databaseName}\n`);

  const collections = await srcDb.listCollections({}, { nameOnly: false }).toArray();
  let totalDocs = 0;

  for (const c of collections) {
    if (c.type === 'view') { console.log(`(skip view) ${c.name}`); continue; }
    const name = c.name;

    const docs = await srcDb.collection(name).find({}).toArray();
    await dstDb.collection(name).drop().catch(() => {}); // ignore "ns not found"
    if (docs.length) {
      await dstDb.collection(name).insertMany(docs, { ordered: false });
    }

    // recreate non-_id indexes
    const indexes = await srcDb.collection(name).indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const { key, name: iname, v, ns, background, ...opts } = idx;
      try {
        await dstDb.collection(name).createIndex(key, { name: iname, ...opts });
      } catch (e) {
        console.warn(`  ! index ${name}.${iname}: ${e.message}`);
      }
    }

    totalDocs += docs.length;
    console.log(`${name.padEnd(32)} ${docs.length} docs`);
  }

  console.log(`\nDone. ${collections.length} collections, ${totalDocs} docs copied.`);
  await src.close();
  await dst.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
