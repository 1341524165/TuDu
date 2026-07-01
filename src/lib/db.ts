import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'tudu.db'));
db.pragma('journal_mode = WAL');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create categories table
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    isCustom INTEGER DEFAULT 1
  )
`);

// Add categoryId column to tasks table if it doesn't exist
type TableInfoColumn = {
  name: string;
};

const tableInfo = db.pragma("table_info(tasks)") as TableInfoColumn[];
const hasCategoryId = tableInfo.some((col) => col.name === 'categoryId');
if (!hasCategoryId) {
  db.exec('ALTER TABLE tasks ADD COLUMN categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL');
}

// Add dueDate column to tasks table if it doesn't exist
const hasDueDate = tableInfo.some((col) => col.name === 'dueDate');
if (!hasDueDate) {
  db.exec('ALTER TABLE tasks ADD COLUMN dueDate TEXT');
}

const hasFailureReason = tableInfo.some((col) => col.name === 'failureReason');
if (!hasFailureReason) {
  db.exec('ALTER TABLE tasks ADD COLUMN failureReason TEXT');
}


// Seed default categories if they don't exist
const count = db.prepare('SELECT COUNT(*) as count FROM categories WHERE isCustom = 0').get() as { count: number };
if (count.count === 0) {
  const insert = db.prepare('INSERT OR IGNORE INTO categories (name, color, isCustom) VALUES (?, ?, 0)');
  insert.run('Inbox', '#94a3b8');     // Slate
  insert.run('Work', '#a78bfa');      // Violet
  insert.run('Personal', '#34d399');  // Emerald
  insert.run('Shopping', '#fbbf24');  // Amber
}

export default db;
