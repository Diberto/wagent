import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'wagent.db');
const JSON_FILE = path.join(DATA_DIR, 'db.json');

// Asegurar directorio data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class SQLiteStorage {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    try {
      this.db = new Database(DB_FILE);
      
      // Optimizaciones de rendimiento extremo (WAL Mode, In-Memory Temp Store, 64MB Cache)
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64 MB
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 268435456'); // 256 MB memory-mapped
      
      this.createTables();
      this.prepareStatements();
      this.checkAndMigrateFromJson();
      
      console.log('⚡ [SQLiteStorage] Base de datos SQLite inicializada en Modo WAL con caché de 64MB.');
    } catch (err) {
      console.error('❌ [SQLiteStorage] Error inicializando SQLite:', err);
      throw err;
    }
  }

  createTables() {
    this.db.exec(`
      -- Productos
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        unit TEXT DEFAULT 'kg',
        stock REAL DEFAULT 0,
        category TEXT,
        barcode TEXT,
        is_available INTEGER DEFAULT 1,
        is_available_delivery INTEGER DEFAULT 1,
        is_available_counter INTEGER DEFAULT 1,
        min_order REAL DEFAULT 0.5,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

      -- Pedidos / Órdenes
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_phone TEXT,
        customer_name TEXT,
        total REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_method TEXT,
        branch_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

      -- Leads / Contactos
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'nuevo',
        last_interaction TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

      -- Mensajes de WhatsApp
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        from_me INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

      -- Recetas Tradicionales
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        meat_cut_id TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recipes_meat_cut_id ON recipes(meat_cut_id);

      -- Agentes IA
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        data TEXT NOT NULL
      );

      -- Sucursales
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        data TEXT NOT NULL
      );

      -- Base de Conocimiento
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        data TEXT NOT NULL
      );

      -- Usuarios Administradores
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        data TEXT NOT NULL
      );

      -- Cola de Tareas Asíncronas
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
        priority INTEGER DEFAULT 0,    -- Mayor número = mayor prioridad
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        result TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at ASC);

      -- Almacén Clave-Valor para configuraciones y estados dinámicos
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  prepareStatements() {
    // Statements precompilados para máxima velocidad
    this.stmts = {
      // Products
      getAllProducts: this.db.prepare('SELECT data FROM products'),
      getProductById: this.db.prepare('SELECT data FROM products WHERE id = ?'),
      upsertProduct: this.db.prepare(`
        INSERT INTO products (id, sku, name, price, unit, stock, category, barcode, is_available, is_available_delivery, is_available_counter, min_order, data)
        VALUES (@id, @sku, @name, @price, @unit, @stock, @category, @barcode, @is_available, @is_available_delivery, @is_available_counter, @min_order, @data)
        ON CONFLICT(id) DO UPDATE SET
          sku = excluded.sku,
          name = excluded.name,
          price = excluded.price,
          unit = excluded.unit,
          stock = excluded.stock,
          category = excluded.category,
          barcode = excluded.barcode,
          is_available = excluded.is_available,
          is_available_delivery = excluded.is_available_delivery,
          is_available_counter = excluded.is_available_counter,
          min_order = excluded.min_order,
          data = excluded.data
      `),
      deleteProduct: this.db.prepare('DELETE FROM products WHERE id = ?'),

      // Orders
      getAllOrders: this.db.prepare('SELECT data FROM orders ORDER BY created_at DESC'),
      getOrderById: this.db.prepare('SELECT data FROM orders WHERE id = ?'),
      upsertOrder: this.db.prepare(`
        INSERT INTO orders (id, customer_phone, customer_name, total, status, payment_method, branch_id, created_at, updated_at, data)
        VALUES (@id, @customer_phone, @customer_name, @total, @status, @payment_method, @branch_id, @created_at, @updated_at, @data)
        ON CONFLICT(id) DO UPDATE SET
          customer_phone = excluded.customer_phone,
          customer_name = excluded.customer_name,
          total = excluded.total,
          status = excluded.status,
          payment_method = excluded.payment_method,
          branch_id = excluded.branch_id,
          updated_at = excluded.updated_at,
          data = excluded.data
      `),

      // Leads
      getAllLeads: this.db.prepare('SELECT data FROM leads ORDER BY updated_at DESC'),
      getLeadByPhone: this.db.prepare('SELECT data FROM leads WHERE phone = ?'),
      upsertLead: this.db.prepare(`
        INSERT INTO leads (id, phone, name, status, last_interaction, created_at, updated_at, data)
        VALUES (@id, @phone, @name, @status, @last_interaction, @created_at, @updated_at, @data)
        ON CONFLICT(phone) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          last_interaction = excluded.last_interaction,
          updated_at = excluded.updated_at,
          data = excluded.data
      `),

      // Recipes
      getAllRecipes: this.db.prepare('SELECT data FROM recipes'),
      upsertRecipe: this.db.prepare(`
        INSERT INTO recipes (id, name, category, meat_cut_id, data)
        VALUES (@id, @name, @category, @meat_cut_id, @data)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          meat_cut_id = excluded.meat_cut_id,
          data = excluded.data
      `),

      // Agents
      getAllAgents: this.db.prepare('SELECT data FROM agents'),
      upsertAgent: this.db.prepare(`
        INSERT INTO agents (id, name, role, is_default, is_active, data)
        VALUES (@id, @name, @role, @is_default, @is_active, @data)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          is_default = excluded.is_default,
          is_active = excluded.is_active,
          data = excluded.data
      `),
      deleteAgent: this.db.prepare('DELETE FROM agents WHERE id = ?'),

      // Branches
      getAllBranches: this.db.prepare('SELECT data FROM branches'),
      upsertBranch: this.db.prepare(`
        INSERT INTO branches (id, name, is_active, data)
        VALUES (@id, @name, @is_active, @data)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          is_active = excluded.is_active,
          data = excluded.data
      `),

      // KV Store
      getKV: this.db.prepare('SELECT value FROM kv_store WHERE key = ?'),
      setKV: this.db.prepare(`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `),

      // Stats
      getStats: this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM products) as products_count,
          (SELECT COUNT(*) FROM orders) as orders_count,
          (SELECT COUNT(*) FROM leads) as leads_count,
          (SELECT COUNT(*) FROM recipes) as recipes_count,
          (SELECT COUNT(*) FROM agents) as agents_count,
          (SELECT COUNT(*) FROM tasks WHERE status = 'pending') as pending_tasks_count
      `)
    };
  }

  checkAndMigrateFromJson() {
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM products').get();
    if (countRow.count === 0 && fs.existsSync(JSON_FILE)) {
      console.log('🔄 [SQLiteStorage] Base de datos vacía detectada. Iniciando migración instantánea desde db.json...');
      try {
        const rawJson = fs.readFileSync(JSON_FILE, 'utf-8');
        const data = JSON.parse(rawJson);
        this.migrateFromJsonData(data);
        console.log('✅ [SQLiteStorage] Migración completada con éxito. Todos los registros fueron transferidos a SQLite WAL.');
      } catch (err) {
        console.error('❌ [SQLiteStorage] Error migrando desde db.json:', err);
      }
    }
  }

  migrateFromJsonData(data) {
    const insertMany = this.db.transaction(() => {
      // Products
      if (Array.isArray(data.products)) {
        for (const p of data.products) {
          this.saveProduct(p);
        }
      }

      // Orders
      if (Array.isArray(data.orders)) {
        for (const o of data.orders) {
          this.saveOrder(o);
        }
      }

      // Leads
      if (Array.isArray(data.leads)) {
        for (const l of data.leads) {
          this.saveLead(l);
        }
      }

      // Recipes
      if (Array.isArray(data.recipes)) {
        for (const r of data.recipes) {
          this.saveRecipe(r);
        }
      }

      // Agents
      if (Array.isArray(data.agents)) {
        for (const a of data.agents) {
          this.saveAgent(a);
        }
      }

      // Branches
      if (Array.isArray(data.branches)) {
        for (const b of data.branches) {
          this.saveBranch(b);
        }
      }

      // Settings & Others
      if (data.settings) {
        this.setKV('settings', data.settings);
      }
      if (data.storeSettings) {
        this.setKV('storeSettings', data.storeSettings);
      }
      if (data.knowledgeBase) {
        this.setKV('knowledgeBase', data.knowledgeBase);
      }
      if (data.users) {
        this.setKV('users', data.users);
      }
      if (data.media) {
        this.setKV('media', data.media);
      }
    });

    insertMany();
  }

  // --- MÉTODOS CRUD RÁPIDOS ---

  // Products
  getProducts() {
    const rows = this.stmts.getAllProducts.all();
    return rows.map(r => JSON.parse(r.data));
  }

  getProductById(id) {
    const row = this.stmts.getProductById.get(id);
    return row ? JSON.parse(row.data) : null;
  }

  saveProduct(p) {
    if (!p.id) p.id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const params = {
      id: String(p.id),
      sku: p.sku || '',
      name: p.name || 'Sin Nombre',
      price: Number(p.price) || 0,
      unit: p.unit || 'kg',
      stock: Number(p.stock) || 0,
      category: p.category || 'general',
      barcode: p.barcode || '',
      is_available: p.isAvailable !== false ? 1 : 0,
      is_available_delivery: p.isAvailableDelivery !== false ? 1 : 0,
      is_available_counter: p.isAvailableCounter !== false ? 1 : 0,
      min_order: Number(p.minOrder) || 0.5,
      data: JSON.stringify(p)
    };
    this.stmts.upsertProduct.run(params);
    return p;
  }

  saveProducts(products) {
    const runBatch = this.db.transaction((items) => {
      for (const p of items) {
        this.saveProduct(p);
      }
    });
    runBatch(products);
    return products;
  }

  deleteProduct(id) {
    this.stmts.deleteProduct.run(String(id));
  }

  // Orders
  getOrders() {
    const rows = this.stmts.getAllOrders.all();
    return rows.map(r => JSON.parse(r.data));
  }

  getOrderById(id) {
    const row = this.stmts.getOrderById.get(String(id));
    return row ? JSON.parse(row.data) : null;
  }

  saveOrder(o) {
    if (!o.id) o.id = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    const params = {
      id: String(o.id),
      customer_phone: o.customerPhone || o.phone || '',
      customer_name: o.customerName || o.name || 'Cliente',
      total: Number(o.total) || 0,
      status: o.status || 'pending',
      payment_method: o.paymentMethod || 'cash',
      branch_id: o.branchId || 'main',
      created_at: o.createdAt || now,
      updated_at: now,
      data: JSON.stringify(o)
    };
    this.stmts.upsertOrder.run(params);
    return o;
  }

  // Leads
  getLeads() {
    const rows = this.stmts.getAllLeads.all();
    return rows.map(r => JSON.parse(r.data));
  }

  getLeadByPhone(phone) {
    const row = this.stmts.getLeadByPhone.get(String(phone));
    return row ? JSON.parse(row.data) : null;
  }

  saveLead(l) {
    if (!l.id) l.id = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    const params = {
      id: String(l.id),
      phone: String(l.phone),
      name: l.name || '',
      status: l.status || 'nuevo',
      last_interaction: l.lastInteraction || now,
      created_at: l.createdAt || now,
      updated_at: now,
      data: JSON.stringify(l)
    };
    this.stmts.upsertLead.run(params);
    return l;
  }

  // Recipes
  getRecipes() {
    const rows = this.stmts.getAllRecipes.all();
    return rows.map(r => JSON.parse(r.data));
  }

  saveRecipe(r) {
    if (!r.id) r.id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const params = {
      id: String(r.id),
      name: r.name || r.title || 'Receta Tradicional',
      category: r.category || 'Tradicional',
      meat_cut_id: r.meatCutId || (r.suggestedCuts?.[0]?.sku) || '',
      data: JSON.stringify(r)
    };
    this.stmts.upsertRecipe.run(params);
    return r;
  }

  saveRecipes(recipes) {
    const runBatch = this.db.transaction((items) => {
      for (const r of items) {
        this.saveRecipe(r);
      }
    });
    runBatch(recipes);
    return recipes;
  }

  // Agents
  getAgents() {
    const rows = this.stmts.getAllAgents.all();
    return rows.map(r => JSON.parse(r.data));
  }

  saveAgent(a) {
    if (!a.id) a.id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const params = {
      id: String(a.id),
      name: a.name,
      role: a.role || 'vendedor',
      is_default: a.isDefault ? 1 : 0,
      is_active: a.isActive !== false ? 1 : 0,
      data: JSON.stringify(a)
    };
    this.stmts.upsertAgent.run(params);
    return a;
  }

  saveAgents(agents) {
    const runBatch = this.db.transaction((items) => {
      for (const a of items) {
        this.saveAgent(a);
      }
    });
    runBatch(agents);
    return agents;
  }

  deleteAgent(id) {
    this.stmts.deleteAgent.run(String(id));
  }

  // Branches
  getBranches() {
    const rows = this.stmts.getAllBranches.all();
    return rows.map(r => JSON.parse(r.data));
  }

  saveBranch(b) {
    if (!b.id) b.id = `branch_${Date.now()}`;
    const params = {
      id: String(b.id),
      name: b.name,
      is_active: b.isActive !== false ? 1 : 0,
      data: JSON.stringify(b)
    };
    this.stmts.upsertBranch.run(params);
    return b;
  }

  saveBranches(branches) {
    const runBatch = this.db.transaction((items) => {
      for (const b of items) {
        this.saveBranch(b);
      }
    });
    runBatch(branches);
    return branches;
  }

  // Generic KV Store
  getKV(key, defaultValue = null) {
    const row = this.stmts.getKV.get(key);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setKV(key, value) {
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.stmts.setKV.run(key, strVal);
    return value;
  }

  // Health and Stats
  getStats() {
    return this.stmts.getStats.get();
  }

  checkpointWAL() {
    return this.db.pragma('wal_checkpoint(TRUNCATE)');
  }
}

export const sqliteStorage = new SQLiteStorage();
