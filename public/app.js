// State Management
let transactions = [];
let categories = [];
let budgets = [];
let categoryChart = null;
let trendChart = null;

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const transactionForm = document.getElementById('transactionForm');
const budgetForm = document.getElementById('budgetForm');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    await fetchCategories();
    await fetchTransactions();
    await fetchBudgets();
    updateSummary();
    renderCharts();
}

function setupEventListeners() {
    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Add Transaction Modal
    document.getElementById('addTransactionBtn').addEventListener('click', () => {
        openModal('transactionModal');
    });

    // Add Budget Modal
    document.getElementById('addBudgetBtn').addEventListener('click', () => {
        openModal('budgetModal');
    });

    // Close Modals
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    // Transaction Form Submission
    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            amount: document.getElementById('transactionAmount').value,
            type: document.getElementById('transactionType').value,
            category_id: document.getElementById('transactionCategory').value,
            transaction_date: document.getElementById('transactionDate').value,
            description: document.getElementById('transactionDescription').value
        };
        await saveTransaction(formData);
        closeModal('transactionModal');
        initApp();
    });

    // Budget Form Submission
    budgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            category_id: document.getElementById('budgetCategory').value,
            amount: document.getElementById('budgetAmount').value,
            period: document.getElementById('budgetPeriod').value,
            start_date: document.getElementById('budgetStartDate').value,
            end_date: document.getElementById('budgetEndDate').value
        };
        await saveBudget(formData);
        closeModal('budgetModal');
        initApp();
    });

    // SQL Query Execution
    document.getElementById('executeQuery').addEventListener('click', executeCustomQuery);

    // Apply Filters
    document.getElementById('applyFilters').addEventListener('click', async () => {
        const type = document.getElementById('typeFilter').value;
        const cat = document.getElementById('categoryFilter').value;
        await fetchTransactions(type, cat);
    });
}

// API Calls
async function fetchCategories() {
    const res = await fetch('/api/categories');
    categories = await res.json();
    populateCategorySelects();
}

async function fetchTransactions(type = '', categoryId = '') {
    let url = '/api/transactions';
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (categoryId) params.append('categoryId', categoryId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    transactions = await res.json();
    renderTransactions();
    renderRecentTransactions();
}

async function fetchBudgets() {
    const res = await fetch('/api/budgets');
    budgets = await res.json();
    renderBudgets();
}

async function saveTransaction(data) {
    await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

async function saveBudget(data) {
    await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

async function executeCustomQuery() {
    const query = document.getElementById('sqlQuery').value;
    const resultsDiv = document.getElementById('queryResults');
    resultsDiv.innerHTML = '<p>Executing query...</p>';

    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await res.json();

        if (!data.success) {
            resultsDiv.innerHTML = `<p style="color: #ef4444;">Error: ${data.error}</p>`;
            return;
        }

        if (data.rows.length === 0) {
            resultsDiv.innerHTML = '<p>No results found.</p>';
            return;
        }

        let html = `<table><thead><tr>`;
        data.fields.forEach(f => html += `<th>${f.name}</th>`);
        html += `</tr></thead><tbody>`;
        data.rows.forEach(row => {
            html += `<tr>`;
            data.fields.forEach(f => html += `<td>${row[f.name]}</td>`);
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        resultsDiv.innerHTML = html;
    } catch (err) {
        resultsDiv.innerHTML = `<p style="color: #ef4444;">Failed to execute query.</p>`;
    }
}

// Rendering Functions
function populateCategorySelects() {
    const selects = ['transactionCategory', 'budgetCategory', 'categoryFilter'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = id === 'categoryFilter' ? '<option value="">All Categories</option>' : '';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = `${cat.icon} ${cat.name}`;
            el.appendChild(opt);
        });
        el.value = currentVal;
    });
}

function renderTransactions() {
    const list = document.getElementById('transactionsList');
    list.innerHTML = transactions.map(t => createTransactionHTML(t)).join('');
}

function renderRecentTransactions() {
    const list = document.getElementById('recentTransactions');
    list.innerHTML = transactions.slice(0, 5).map(t => createTransactionHTML(t)).join('');
}

function createTransactionHTML(t) {
    return `
        <div class="transaction-item ${t.type}">
            <div style="display:flex; align-items:center;">
                <span style="font-size: 1.5rem; margin-right: 15px;">${t.icon || '💰'}</span>
                <div>
                    <strong>${t.category_name || 'General'}</strong>
                    <br><small>${t.description || ''}</small>
                </div>
            </div>
            <div class="amount ${t.type}">
                ${t.type === 'income' ? '+' : '-'}$${parseFloat(t.amount).toFixed(2)}
                <br><small>${new Date(t.transaction_date).toLocaleDateString()}</small>
            </div>
        </div>
    `;
}

function renderBudgets() {
    const list = document.getElementById('budgetsList');
    const overview = document.getElementById('budgetOverview');

    const html = budgets.map(b => {
        const percent = Math.min((b.spent / b.amount) * 100, 100);
        const isOver = b.spent > b.amount;
        return `
            <div class="card">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${b.icon} ${b.category_name}</strong>
                    <span>${b.period}</span>
                </div>
                <div style="margin: 10px 0; background: #334155; height: 10px; border-radius: 5px;">
                    <div style="width: ${percent}%; height: 100%; background: ${isOver ? '#ef4444' : '#10b981'}; border-radius: 5px;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 0.8rem;">
                    <span>Spent: $${parseFloat(b.spent).toFixed(2)}</span>
                    <span>Limit: $${parseFloat(b.amount).toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
    overview.innerHTML = html;
}

function updateSummary() {
    let income = 0;
    let expenses = 0;
    transactions.forEach(t => {
        if (t.type === 'income') income += parseFloat(t.amount);
        else expenses += parseFloat(t.amount);
    });

    document.getElementById('totalIncome').textContent = `$${income.toFixed(2)}`;
    document.getElementById('totalExpenses').textContent = `$${expenses.toFixed(2)}`;
    document.getElementById('balance').textContent = `$${(income - expenses).toFixed(2)}`;
}

function renderCharts() {
    const ctx1 = document.getElementById('categoryChart')?.getContext('2d');
    if (!ctx1) return;

    if (categoryChart) categoryChart.destroy();

    const catData = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
        catData[t.category_name] = (catData[t.category_name] || 0) + parseFloat(t.amount);
    });

    categoryChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catData),
            datasets: [{
                data: Object.values(catData),
                backgroundColor: ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899']
            }]
        },
        options: { plugins: { legend: { labels: { color: '#e2e8f0' } } } }
    });
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
