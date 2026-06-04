/**
 * Rebuild ProductListing collection from VendorProduct + SKUs + inventory.
 *
 * Run after clearing productlistings or adding unique indexes:
 *   node scripts/rebuildProductListings.js
 *
 * Optional env:
 *   PRODUCT_LISTING_BATCH_SIZE=500
 *   PRODUCT_LISTING_SYNC_INDEXES=1   (default) sync Mongo indexes first
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dns = require('node:dns/promises');

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ProductListing = require('../models/productListing.model');
const { rebuildAllProductListings } = require('../services/productListingSync.service');

async function connectMongo() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGO_URI not set in .env');
  try {
    await mongoose.connect(uri);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' && err.syscall === 'querySrv' && uri.startsWith('mongodb+srv://')) {
      const match = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/]+)(\/[^?]*)?(\?.*)?$/);
      const q = (match[4] || '').includes('authSource=')
        ? match[4] || ''
        : `${match[4] ? `${match[4]}&` : '?'}authSource=admin`;
      const fallback = match
        ? `mongodb://${match[1]}@${match[2]}:27017${match[3] || '/'}${q}`
        : uri;
      await mongoose.connect(fallback);
    } else {
      throw err;
    }
  }
}

async function run() {
  await connectMongo();
  const syncIndexes = String(process.env.PRODUCT_LISTING_SYNC_INDEXES ?? '1') !== '0';
  const batchSize = Number(process.env.PRODUCT_LISTING_BATCH_SIZE) || 500;

  try {
    const before = await ProductListing.estimatedDocumentCount().catch(() => 0);
    console.log(`[ProductListing] documents before rebuild: ${before}`);

    if (syncIndexes) {
      console.log('[ProductListing] syncing indexes (productId + vendorModel unique, …)…');
      await ProductListing.syncIndexes();
      console.log('[ProductListing] indexes synced.');
    }

    const summary = await rebuildAllProductListings(batchSize);
    console.log('[ProductListing] rebuild summary:', JSON.stringify({
      vendorProductCount: summary.vendorProductCount,
      uniqueVendorModels: summary.uniqueVendorModels,
      duplicateVendorProductsSkipped: summary.duplicateVendorProductsSkipped,
      synced: summary.synced,
      failed: summary.failed,
      listingCount: summary.listingCount,
    }, null, 2));

    if (summary.duplicateVendorProductsSkipped > 0) {
      console.warn(
        `[ProductListing] ${summary.duplicateVendorProductsSkipped} VendorProduct rows share the same vendor model and were skipped (newest kept). Review vendorproducts collection.`
      );
    }
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
