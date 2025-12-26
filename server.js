const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const { pool, initializeDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: result.rows[0].now
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Categories API
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM categories ORDER BY name'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name, type, color, icon } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO categories (name, type, color, icon) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, type, color || '#6366f1', icon || '💰']
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Transactions API
app.get('/api/transactions', async (req, res) => {
    const { startDate, endDate, type, categoryId } = req.query;
    try {
        let query = `
      SELECT t.*, c.name as category_name, c.color, c.icon 
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND t.transaction_date >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }
        if (endDate) {
            query += ` AND t.transaction_date <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }
        if (type) {
            query += ` AND t.type = $${paramCount}`;
            params.push(type);
            paramCount++;
        }
        if (categoryId) {
            query += ` AND t.category_id = $${paramCount}`;
            params.push(categoryId);
            paramCount++;
        }

        query += ' ORDER BY t.transaction_date DESC, t.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    const { amount, description, category_id, transaction_date, type } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO transactions (amount, description, category_id, transaction_date, type) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [amount, description, category_id, transaction_date || new Date(), type]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { amount, description, category_id, transaction_date, type } = req.body;
    try {
        const result = await pool.query(
            `UPDATE transactions 
       SET amount = $1, description = $2, category_id = $3, transaction_date = $4, type = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
            [amount, description, category_id, transaction_date, type, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM transactions WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Budgets API
app.get('/api/budgets', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT b.*, c.name as category_name, c.color, c.icon,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = b.category_id 
        AND t.transaction_date BETWEEN b.start_date AND b.end_date
        AND t.type = 'expense'
      GROUP BY b.id, c.name, c.color, c.icon
      ORDER BY b.start_date DESC
    `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/budgets', async (req, res) => {
    const { category_id, amount, period, start_date, end_date } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO budgets (category_id, amount, period, start_date, end_date) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [category_id, amount, period, start_date, end_date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Analytics API
app.get('/api/analytics/summary', async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const params = [];
        let dateFilter = '';

        if (startDate && endDate) {
            dateFilter = 'WHERE transaction_date BETWEEN $1 AND $2';
            params.push(startDate, endDate);
        }

        const result = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance,
        COUNT(*) as transaction_count
      FROM transactions
      ${dateFilter}
    `, params);

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analytics/by-category', async (req, res) => {
    const { startDate, endDate, type } = req.query;
    try {
        const params = [];
        let filters = ['1=1'];
        let paramCount = 1;

        if (startDate && endDate) {
            filters.push(`t.transaction_date BETWEEN $${paramCount} AND $${paramCount + 1}`);
            params.push(startDate, endDate);
            paramCount += 2;
        }
        if (type) {
            filters.push(`t.type = $${paramCount}`);
            params.push(type);
            paramCount++;
        }

        const result = await pool.query(`
      SELECT 
        c.name as category,
        c.color,
        c.icon,
        COALESCE(SUM(t.amount), 0) as total,
        COUNT(t.id) as count
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id AND ${filters.join(' AND ')}
      GROUP BY c.id, c.name, c.color, c.icon
      HAVING COUNT(t.id) > 0
      ORDER BY total DESC
    `, params);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analytics/trends', async (req, res) => {
    const { months = 6 } = req.query;
    try {
        const result = await pool.query(`
      SELECT 
        TO_CHAR(transaction_date, 'YYYY-MM') as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
      FROM transactions
      WHERE transaction_date >= CURRENT_DATE - INTERVAL '${parseInt(months)} months'
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month
    `);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Custom SQL Query Executor
app.post('/api/query', async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
    }

    // Security: Only allow SELECT queries
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
        return res.status(403).json({
            error: 'Only SELECT queries are allowed for security reasons'
        });
    }

    try {
        const result = await pool.query(query);
        res.json({
            success: true,
            rowCount: result.rowCount,
            rows: result.rows,
            fields: result.fields.map(f => ({ name: f.name, dataType: f.dataTypeID }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Expense Tracker API ready`);
            console.log(`🔗 Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
