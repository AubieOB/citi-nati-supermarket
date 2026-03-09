// SHARED PRISMA INSTANCE - Use this in ALL files
// This prevents connection pool exhaustion and memory leaks
const { PrismaClient } = require('@prisma/client');

const prismaClientSingleton = () => {
  return new PrismaClient();
};

// Reuse single instance across hot reloads in development
const globalForPrisma = global;
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
