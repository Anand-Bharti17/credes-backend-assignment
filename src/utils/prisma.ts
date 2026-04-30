// src/utils/prisma.ts
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in the environment.");
}

// Initialize the pg Pool and the Prisma adapter
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Pass the adapter to the PrismaClient constructor
const prisma = new PrismaClient({ adapter });

export default prisma;