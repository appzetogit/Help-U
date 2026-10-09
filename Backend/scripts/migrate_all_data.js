const mongoose = require('mongoose');

const SOURCE_URI = 'mongodb+srv://homecareofficialsolution:Admin123@cluster0.1tk4tkp.mongodb.net/Homster';
const TARGET_URI = 'mongodb+srv://helpusupport_db_user:KLaC6wRMSfI3v324@serviceprovider.x4ov5z9.mongodb.net/ServerProvider';

async function migrateData() {
  console.log('🚀 Starting Full Database Migration...');
  console.log(`Source DB: Homster`);
  console.log(`Target DB: ServerProvider\n`);

  let sourceConn;
  let targetConn;

  try {
    sourceConn = await mongoose.createConnection(SOURCE_URI, {
      serverSelectionTimeoutMS: 20000
    }).asPromise();
    console.log('✅ Connected to Source DB (Homster)');

    targetConn = await mongoose.createConnection(TARGET_URI, {
      serverSelectionTimeoutMS: 20000
    }).asPromise();
    console.log('✅ Connected to Target DB (ServerProvider)\n');

    const collections = await sourceConn.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections in source DB.\n`);

    const summary = [];

    for (const col of collections) {
      const colName = col.name;
      if (colName.startsWith('system.')) continue;

      try {
        const sourceCollection = sourceConn.db.collection(colName);
        const targetCollection = targetConn.db.collection(colName);

        const docs = await sourceCollection.find({}).toArray();
        if (!docs || docs.length === 0) {
          summary.push({ collection: colName, count: 0, status: 'Empty' });
          continue;
        }

        console.log(`📦 Migrating "${colName}" (${docs.length} documents)...`);

        // Clear target collection first so we don't have schema/index collisions
        await targetCollection.deleteMany({});

        // Insert all documents in batches of 200
        const batchSize = 200;
        let inserted = 0;
        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = docs.slice(i, i + batchSize);
          try {
            await targetCollection.insertMany(batch, { ordered: false });
            inserted += batch.length;
          } catch (batchErr) {
            // Even if some failed, count inserted
            if (batchErr.result && batchErr.result.nInserted) {
              inserted += batchErr.result.nInserted;
            } else if (batchErr.insertedDocs) {
              inserted += batchErr.insertedDocs.length;
            }
            console.warn(`  ⚠️ Warning on batch insert for "${colName}":`, batchErr.message);
          }
        }

        console.log(`  ✅ Successfully copied ${inserted}/${docs.length} docs for "${colName}"`);
        summary.push({ collection: colName, count: inserted, status: 'Success' });
      } catch (colErr) {
        console.error(`  ❌ Error migrating collection "${colName}":`, colErr.message);
        summary.push({ collection: colName, count: 0, status: `Failed: ${colErr.message}` });
      }
    }

    console.log('\n========================================');
    console.log('🎉 FULL MIGRATION COMPLETE!');
    console.log('========================================');
    console.table(summary);

  } catch (error) {
    console.error('❌ Migration connection failed:', error);
  } finally {
    if (sourceConn) await sourceConn.close();
    if (targetConn) await targetConn.close();
    console.log('\n🔒 Connections closed.');
  }
}

migrateData();
