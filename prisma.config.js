// prisma.config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  migrate: {
    url: process.env.DATABASE_URL,
  }
};