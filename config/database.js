const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income')),
        color VARCHAR(7) DEFAULT '#6366f1',
        icon VARCHAR(50) DEFAULT '💰',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create budgets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL,
        period VARCHAR(20) NOT NULL CHECK (period IN ('monthly', 'yearly')),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category_id, period, start_date)
      )
    `);

    // Insert default categories
    await client.query(`
      INSERT INTO categories (name, type, color, icon) VALUES
      ('Food & Dining', 'expense', '#ef4444', '🍔'),
      ('Transportation', 'expense', '#f59e0b', '🚗'),
      ('Shopping', 'expense', '#ec4899', '🛍️'),
      ('Entertainment', 'expense', '#8b5cf6', '🎬'),
      ('Bills & Utilities', 'expense', '#06b6d4', '💡'),
      ('Healthcare', 'expense', '#10b981', '🏥'),
      ('Salary', 'income', '#22c55e', '💼'),
      ('Freelance', 'income', '#3b82f6', '💻'),
      ('Investments', 'income', '#14b8a6', '📈'),
      ('Other', 'expense', '#64748b', '📦')
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, initializeDatabase };
