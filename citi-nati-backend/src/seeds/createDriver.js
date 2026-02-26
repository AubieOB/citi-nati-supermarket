const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const createDriver = async () => {
  try {
    const driverEmail = 'driver@test.com';
    const driverName = 'Test Driver';
    const driverPassword = '12345678';

    // Check if driver already exists
    const existingDriver = await prisma.user.findUnique({
      where: { email: driverEmail },
    });

    if (existingDriver) {
      console.log('Driver already exists');
      return;
    }

    // Hash password using same logic as registration controller
    const passwordHash = await bcrypt.hash(driverPassword, 10);

    // Create driver user
    const driver = await prisma.user.create({
      data: {
        name: driverName,
        email: driverEmail,
        passwordHash,
        role: 'driver',
      },
    });

    console.log('Driver created successfully');
    console.log(`Driver ID: ${driver.id}`);
    console.log(`Driver Email: ${driver.email}`);
    console.log(`Driver Name: ${driver.name}`);
    console.log(`Driver Role: ${driver.role}`);
  } catch (error) {
    console.error('Error creating driver:', error);
  } finally {
    await prisma.$disconnect();
  }
};

createDriver();
