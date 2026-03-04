/**
 * Script to clear all POS synced products from the database
 * Usage: node clear-pos-products.js
 * 
 * This script:
 * 1. Connects to PostgreSQL database
 * 2. Deletes all products where sourceCode is NOT null (i.e., POS products)
 * 3. Logs the count of deleted products
 * 4. Resets auto-increment ID sequence (optional)
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearPOSProducts() {
  try {
    console.log('\n📦 POS PRODUCTS CLEAR SCRIPT');
    console.log('================================\n');

    // Get count before deletion
    const beforeCount = await prisma.product.count();
    const posCount = await prisma.product.count({
      where: {
        sourceCode: {
          not: null
        }
      }
    });

    console.log(`📊 Current database state:`);
    console.log(`   Total products: ${beforeCount}`);
    console.log(`   POS products (with sourceCode): ${posCount}`);
    console.log(`   Admin products: ${beforeCount - posCount}\n`);

    // Delete all POS products
    console.log('🗑️  Deleting all POS synced products...\n');
    const deleted = await prisma.product.deleteMany({
      where: {
        sourceCode: {
          not: null
        }
      }
    });

    console.log(`✅ Successfully deleted ${deleted.count} POS products\n`);

    // Get count after deletion
    const afterCount = await prisma.product.count();
    console.log(`📊 Database after deletion:`);
    console.log(`   Total products: ${afterCount}`);
    console.log(`   Admin products remaining: ${afterCount}\n`);

    console.log('✨ POS products cleared successfully!');
    console.log('💡 You can now restart the POS Agent to sync fresh products.\n');

  } catch (error) {
    console.error('❌ Error clearing POS products:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearPOSProducts();
