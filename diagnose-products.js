#!/usr/bin/env node

/**
 * BACKEND DIAGNOSTIC - Check product structure
 */

const { PrismaClient } = require('./citi-nati-backend/prisma/generated/client');
const prisma = new PrismaClient();

async function diagnose() {
  try {
    console.log('🔍 Checking Product Structure...\n');

    // Get one product
    const sample = await prisma.product.findFirst({
      take: 1
    });

    if (!sample) {
      console.log('❌ No products found in database');
      return;
    }

    console.log('✅ Sample product found:');
    console.log(`   ID: ${sample.id}`);
    console.log(`   Name: ${sample.name}`);
    console.log(`   Enabled: ${sample.enabled}`);
    console.log(`   IsActive: ${sample.isActive}`);
    console.log(`   Category: ${sample.category}\n`);

    // Check counts
    console.log('📊 Product Counts:');
    const total = await prisma.product.count();
    const enabled = await prisma.product.count({ where: { enabled: true } });
    const disabled = await prisma.product.count({ where: { enabled: false } });
    const active = await prisma.product.count({ where: { isActive: true } });

    console.log(`   Total: ${total}`);
    console.log(`   Enabled: ${enabled}`);
    console.log(`   Disabled: ${disabled}`);
    console.log(`   Active: ${active}\n`);

    // Check pagination
    console.log('📄 Testing Pagination:');
    const page1 = await prisma.product.findMany({
      where: { enabled: true, isActive: true },
      take: 20,
      skip: 0
    });
    console.log(`   Page 1 (first 20): ${page1.length} products`);

    if (page1.length > 0) {
      console.log(`   First: ${page1[0].name}`);
      console.log(`   Last: ${page1[page1.length - 1].name}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
