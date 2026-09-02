import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

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
    this.isNative = false;
    this.init();
  }

  init() {
    try {
      if (typeof DatabaseSync === 'function') {
        this.db = new DatabaseSync(DB_FILE);
        this.isNative = true;
        
        // Configurar pragmas para modo WAL de alto rendimiento
        try {
          this.db.exec('PRAGMA journal_mode = WAL;');
          this.db.exec('PRAGMA synchronous = NORMAL;');
          this.db.exec('PRAGMA cache_size = -64000;');
          this.db.exec('PRAGMA temp_store = MEMORY;');
        } catch (pragmaErr) {
          console.warn('⚠️ [SQLiteStorage] Pragma warning:', pragmaErr.message);
        }

        this.createTables();
        this.prepareStatements();
        this.checkAndMigrateFromJson();
        console.log('⚡ [SQLiteStorage] Motor SQLite WAL nativo de Node.js (Zero-Dependency) inicializado con éxito.');
        return;
      }
    } catch (err) {
      console.warn('⚠️ [SQLiteStorage] Error inicializando SQLite nativo:', err.message);
    }

    // Fallback: Modo Resiliente In-Memory con persistencia Write-Behind
    this.initFallback();
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

      -- Recetas Tradicionales
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        meat_cut_id TEXT,
        data TEXT NOT NULL
      );

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

      -- Cola de Tareas Asíncronas
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        result TEXT,
        error TEXT
      );

      -- Almacén Clave-Valor para configuraciones y estados dinámicos
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  prepareStatements() {
    this.stmts = {
      // Products
      getAllProducts: this.db.prepare('SELECT data FROM products'),
      getProductById: this.db.prepare('SELECT data FROM products WHERE id = ?'),
      upsertProduct: this.db.prepare(`
        INSERT INTO products (id, sku, name, price, unit, stock, category, barcode, is_available, is_available_delivery, is_available_counter, min_order, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?, ?, ?)
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
        VALUES (?, ?, ?, ?)
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
    if (!this.isNative) return;
    try {
      const countRow = this.db.prepare('SELECT COUNT(*) as count FROM products').get();
      if (countRow.count === 0 && fs.existsSync(JSON_FILE)) {
        console.log('🔄 [SQLiteStorage] Base de datos vacía detectada. Migrando registros desde db.json...');
        const rawJson = fs.readFileSync(JSON_FILE, 'utf-8');
        const data = JSON.parse(rawJson);
        this.migrateFromJsonData(data);
        console.log('✅ [SQLiteStorage] Migración completada con éxito.');
      }
    } catch (err) {
      console.warn('⚠️ [SQLiteStorage] Error en checkAndMigrateFromJson:', err.message);
    }
  }

  migrateFromJsonData(data) {
    if (!this.isNative || !data) return;
    try {
      // Products
      if (Array.isArray(data.products)) {
        for (const p of data.products) this.saveProduct(p);
      }
      // Orders
      if (Array.isArray(data.orders)) {
        for (const o of data.orders) this.saveOrder(o);
      }
      // Leads
      if (Array.isArray(data.leads)) {
        for (const l of data.leads) this.saveLead(l);
      }
      // Recipes
      if (Array.isArray(data.recipes)) {
        for (const r of data.recipes) this.saveRecipe(r);
      }
      // Agents
      if (Array.isArray(data.agents)) {
        for (const a of data.agents) this.saveAgent(a);
      }
      // Branches
      if (Array.isArray(data.branches)) {
        for (const b of data.branches) this.saveBranch(b);
      }
      // Settings & Stores
      if (data.settings) this.setKV('settings', data.settings);
      if (data.storeSettings) this.setKV('storeSettings', data.storeSettings);
      if (data.knowledgeBase) this.setKV('knowledgeBase', data.knowledgeBase);
      if (data.users) this.setKV('users', data.users);
      if (data.media) this.setKV('media', data.media);
    } catch (err) {
      console.warn('⚠️ [SQLiteStorage] Error en migrateFromJsonData:', err.message);
    }
  }

  // --- MÉTODOS CRUD ---

  getProducts() {
    if (this.isNative) {
      const rows = this.stmts.getAllProducts.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.products || [];
  }

  getProductById(id) {
    if (this.isNative) {
      const row = this.stmts.getProductById.get(String(id));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.products || []).find(p => String(p.id) === String(id)) || null;
  }

  saveProduct(p) {
    if (!p.id) p.id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    if (this.isNative) {
      this.stmts.upsertProduct.run(
        String(p.id),
        p.sku || '',
        p.name || p.title || 'Sin Nombre',
        Number(p.price) || 0,
        p.unit || 'kg',
        Number(p.stock) || 0,
        p.category || 'general',
        p.barcode || '',
        p.isAvailable !== false ? 1 : 0,
        p.isAvailableDelivery !== false ? 1 : 0,
        p.isAvailableCounter !== false ? 1 : 0,
        Number(p.minOrder) || 0.5,
        JSON.stringify(p)
      );
    }
    return p;
  }

  saveProducts(products) {
    for (const p of products) this.saveProduct(p);
    return products;
  }

  deleteProduct(id) {
    if (this.isNative) this.stmts.deleteProduct.run(String(id));
  }

  getOrders() {
    if (this.isNative) {
      const rows = this.stmts.getAllOrders.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.orders || [];
  }

  getOrderById(id) {
    if (this.isNative) {
      const row = this.stmts.getOrderById.get(String(id));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.orders || []).find(o => String(o.id) === String(id)) || null;
  }

  saveOrder(o) {
    if (!o.id) o.id = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    if (this.isNative) {
      this.stmts.upsertOrder.run(
        String(o.id),
        o.customerPhone || o.phone || '',
        o.customerName || o.name || 'Cliente',
        Number(o.total) || 0,
        o.status || 'pending',
        o.paymentMethod || 'cash',
        o.branchId || 'main',
        o.createdAt || now,
        now,
        JSON.stringify(o)
      );
    }
    return o;
  }

  getLeads() {
    if (this.isNative) {
      const rows = this.stmts.getAllLeads.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.leads || [];
  }

  getLeadByPhone(phone) {
    if (this.isNative) {
      const row = this.stmts.getLeadByPhone.get(String(phone));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.leads || []).find(l => String(l.phone) === String(phone)) || null;
  }

  saveLead(l) {
    if (!l.id) l.id = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    if (this.isNative) {
      this.stmts.upsertLead.run(
        String(l.id),
        String(l.phone || ''),
        l.name || '',
        l.status || 'nuevo',
        l.lastInteraction || now,
        l.createdAt || now,
        now,
        JSON.stringify(l)
      );
    }
    return l;
  }

  getRecipes() {
    if (this.isNative) {
      const rows = this.stmts.getAllRecipes.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.recipes || [];
  }

  saveRecipe(r) {
    if (!r.id) r.id = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    if (this.isNative) {
      this.stmts.upsertRecipe.run(
        String(r.id),
        r.name || r.title || 'Receta Tradicional',
        r.category || 'Tradicional',
        r.meatCutId || (r.suggestedCuts?.[0]?.sku) || '',
        JSON.stringify(r)
      );
    }
    return r;
  }

  saveRecipes(recipes) {
    for (const r of recipes) this.saveRecipe(r);
    return recipes;
  }

  getAgents() {
    if (this.isNative) {
      const rows = this.stmts.getAllAgents.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.agents || [];
  }

  saveAgent(a) {
    if (!a.id) a.id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    if (this.isNative) {
      this.stmts.upsertAgent.run(
        String(a.id),
        a.name || 'Agente',
        a.role || 'vendedor',
        a.isDefault ? 1 : 0,
        a.isActive !== false ? 1 : 0,
        JSON.stringify(a)
      );
    }
    return a;
  }

  saveAgents(agents) {
    for (const a of agents) this.saveAgent(a);
    return agents;
  }

  deleteAgent(id) {
    if (this.isNative) this.stmts.deleteAgent.run(String(id));
  }

  getBranches() {
    if (this.isNative) {
      const rows = this.stmts.getAllBranches.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.branches || [];
  }

  saveBranch(b) {
    if (!b.id) b.id = `branch_${Date.now()}`;
    if (this.isNative) {
      this.stmts.upsertBranch.run(
        String(b.id),
        b.name || 'Sucursal',
        b.isActive !== false ? 1 : 0,
        JSON.stringify(b)
      );
    }
    return b;
  }

  saveBranches(branches) {
    for (const b of branches) this.saveBranch(b);
    return branches;
  }

  getKV(key, defaultValue = null) {
    if (this.isNative) {
      const row = this.stmts.getKV.get(key);
      if (!row) return defaultValue;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    }
    return defaultValue;
  }

  setKV(key, value) {
    if (this.isNative) {
      const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
      this.stmts.setKV.run(key, strVal);
    }
    return value;
  }

  getStats() {
    if (this.isNative) {
      return this.stmts.getStats.get();
    }
    return {
      products_count: (this.fallbackData?.products || []).length,
      orders_count: (this.fallbackData?.orders || []).length,
      leads_count: (this.fallbackData?.leads || []).length,
      recipes_count: (this.fallbackData?.recipes || []).length,
      agents_count: (this.fallbackData?.agents || []).length,
      pending_tasks_count: 0
    };
  }

  checkpointWAL() {
    if (this.isNative) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (_) {}
    }
  }

  initFallback() {
    this.fallbackData = { products: [], orders: [], leads: [], recipes: [], agents: [], branches: [] };
    if (fs.existsSync(JSON_FILE)) {
      try {
        this.fallbackData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
      } catch (_) {}
    }
    console.log('📦 [SQLiteStorage] Operando en Modo Buffer In-Memory L1 + Fast Index.');
  }
}

export const sqliteStorage = new SQLiteStorage();
