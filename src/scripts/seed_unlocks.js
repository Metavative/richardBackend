// src/scripts/seed_unlocks.js
import 'dotenv/config';
import mongoose from 'mongoose';

// Robustly load connectDB whether it’s named or default export
async function loadConnectDB() {
  const mod = await import('../config/db.js');
  return mod.connectDB || mod.default;
}

// ---------------------------
// Seed data (edit as needed)
// ---------------------------
const UNLOCKS = [
  { key: 'box_pre_vehicle_check', title: 'Pre-Vehicle Check', priceGBP: 2.99, type: 'BOX', active: true },
  { key: 'box_receipt_trip_records', title: 'Receipt / Trip Records', priceGBP: 1.99, type: 'BOX', active: true },
  { key: 'box_documents_expiry_reminders', title: 'Documents & Expiry Reminders', priceGBP: 1.99, type: 'BOX', active: true },
  { key: 'box_incident_accident_form', title: 'Incident / Accident Form', priceGBP: 1.99, type: 'BOX', active: true },
];

function getUnlockModel() {
  // If you already have a model registered somewhere, reuse it.
  if (mongoose.models.Unlock) return mongoose.models.Unlock;

  const schema = new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, index: true },
      title: { type: String, required: true },
      priceGBP: { type: Number, required: true },
      type: { type: String, default: 'BOX' },
      active: { type: Boolean, default: true },
    },
    { timestamps: true }
  );

  // Explicit collection name: "unlocks"
  return mongoose.model('Unlock', schema, 'unlocks');
}

async function run() {
  const startedAt = Date.now();

  try {
    const connectDB = await loadConnectDB();
    if (typeof connectDB !== 'function') {
      throw new Error(
        'connectDB was not found. Check src/config/db.js export (named connectDB or default export).'
      );
    }

    // ✅ Uses your existing env + connection logic
    await connectDB();

    const Unlock = getUnlockModel();

    const ops = UNLOCKS.map((u) => ({
      updateOne: {
        filter: { key: u.key },
        update: {
          $set: { ...u, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    }));

    const result = await Unlock.bulkWrite(ops, { ordered: false });

    console.log('✅ Unlock seeding complete.');
    console.log(
      JSON.stringify(
        {
          matched: result.matchedCount,
          upserted: result.upsertedCount,
          modified: result.modifiedCount,
          ms: Date.now() - startedAt,
        },
        null,
        2
      )
    );

    const total = await Unlock.countDocuments({});
    console.log(`� Total unlock records: ${total}`);
  } catch (err) {
    console.error('❌ Seed unlocks failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.close();
      }
    } catch (_) {}
  }
}

run();
