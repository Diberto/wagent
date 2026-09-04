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

      -- Cajas y Turnos POS (Apertura y Cierre)
      CREATE TABLE IF NOT EXISTS cash_registers (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        user_id TEXT,
        status TEXT DEFAULT 'open',
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cash_registers_branch ON cash_registers(branch_id, status);

      -- Usuarios Unificados (Clientes, Staff, Cadetes, Admins y Agentes de IA)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        role TEXT DEFAULT 'cliente',
        user_type TEXT DEFAULT 'customer',
        phone TEXT UNIQUE,
        email TEXT UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT,
        otp_hash TEXT,
        otp_expires_at INTEGER,
        address TEXT,
        neighborhood TEXT,
        postal_code TEXT,
        birth_date TEXT,
        status TEXT DEFAULT 'active',
        ai_controller TEXT,
        preferences TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
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

    // Auto-migración segura de columnas en tabla users si ya existía previamente
    try {
      const userCols = this.db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      if (userCols.length > 0) {
        const requiredCols = [
          { name: 'user_type', type: "TEXT DEFAULT 'customer'" },
          { name: 'phone', type: 'TEXT' },
          { name: 'email', type: 'TEXT' },
          { name: 'full_name', type: "TEXT DEFAULT 'Usuario'" },
          { name: 'password_hash', type: 'TEXT' },
          { name: 'otp_hash', type: 'TEXT' },
          { name: 'otp_expires_at', type: 'INTEGER' },
          { name: 'address', type: 'TEXT' },
          { name: 'neighborhood', type: 'TEXT' },
          { name: 'postal_code', type: 'TEXT' },
          { name: 'birth_date', type: 'TEXT' },
          { name: 'status', type: "TEXT DEFAULT 'active'" },
          { name: 'ai_controller', type: 'TEXT' },
          { name: 'preferences', type: 'TEXT' },
          { name: 'created_at', type: 'TEXT' },
          { name: 'updated_at', type: 'TEXT' },
          { name: 'data', type: 'TEXT' }
        ];
        for (const col of requiredCols) {
          if (!userCols.includes(col.name)) {
            try {
              this.db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // Crear índices de users una vez asegurada la existencia de columnas
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
        CREATE INDEX IF NOT EXISTS idx_users_neighborhood ON users(neighborhood);
        CREATE INDEX IF NOT EXISTS idx_users_postal_code ON users(postal_code);
      `);
    } catch (_) {}
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

      // Cash Registers & Shifts (Apertura y Cierre de Caja)
      getAllShifts: this.db.prepare('SELECT data FROM cash_registers ORDER BY opened_at DESC'),
      getShiftById: this.db.prepare('SELECT data FROM cash_registers WHERE id = ?'),
      getActiveShiftByBranch: this.db.prepare("SELECT data FROM cash_registers WHERE branch_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1"),
      upsertShift: this.db.prepare(`
        INSERT INTO cash_registers (id, branch_id, user_id, status, opened_at, closed_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          branch_id = excluded.branch_id,
          user_id = excluded.user_id,
          status = excluded.status,
          opened_at = excluded.opened_at,
          closed_at = excluded.closed_at,
          data = excluded.data
      `),

      // Users (Cuentas unificadas & Agentes de IA)
      getAllUsers: this.db.prepare('SELECT data FROM users ORDER BY created_at DESC'),
      getUserById: this.db.prepare('SELECT data FROM users WHERE id = ?'),
      getUserByPhone: this.db.prepare('SELECT data FROM users WHERE phone = ?'),
      getUserByEmail: this.db.prepare('SELECT data FROM users WHERE email = ?'),
      getUserByUsername: this.db.prepare('SELECT data FROM users WHERE username = ?'),
      upsertUser: this.db.prepare(`
        INSERT INTO users (id, username, role, user_type, phone, email, full_name, password_hash, otp_hash, otp_expires_at, address, neighborhood, postal_code, birth_date, status, ai_controller, preferences, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          role = excluded.role,
          user_type = excluded.user_type,
          phone = excluded.phone,
          email = excluded.email,
          full_name = excluded.full_name,
          password_hash = excluded.password_hash,
          otp_hash = excluded.otp_hash,
          otp_expires_at = excluded.otp_expires_at,
          address = excluded.address,
          neighborhood = excluded.neighborhood,
          postal_code = excluded.postal_code,
          birth_date = excluded.birth_date,
          status = excluded.status,
          ai_controller = excluded.ai_controller,
          preferences = excluded.preferences,
          updated_at = excluded.updated_at,
          data = excluded.data
      `),
      deleteUser: this.db.prepare('DELETE FROM users WHERE id = ?'),

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
      // Users
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          try { this.saveUser(u); } catch (_) {}
        }
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

  // Cajas y Turnos POS
  getShifts() {
    if (this.isNative) {
      const rows = this.stmts.getAllShifts.all();
      return rows.map(r => JSON.parse(r.data));
    }
    return this.fallbackData.cash_registers || [];
  }

  getShiftById(id) {
    if (this.isNative) {
      const row = this.stmts.getShiftById.get(String(id));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.cash_registers || []).find(s => String(s.id) === String(id)) || null;
  }

  getActiveShift(branchId) {
    if (this.isNative) {
      const row = this.stmts.getActiveShiftByBranch.get(String(branchId));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.cash_registers || []).find(s => s.branchId === branchId && s.status === 'open') || null;
  }

  saveShift(s) {
    if (!s.id) s.id = `shift_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    if (this.isNative) {
      this.stmts.upsertShift.run(
        String(s.id),
        String(s.branchId || 'main'),
        String(s.userId || ''),
        String(s.status || 'open'),
        String(s.openedAt || new Date().toISOString()),
        s.closedAt ? String(s.closedAt) : null,
        JSON.stringify(s)
      );
    } else {
      if (!this.fallbackData.cash_registers) this.fallbackData.cash_registers = [];
      const idx = this.fallbackData.cash_registers.findIndex(x => x.id === s.id);
      if (idx >= 0) this.fallbackData.cash_registers[idx] = s;
      else this.fallbackData.cash_registers.unshift(s);
    }
    return s;
  }

  // --- MÉTODOS CRUD USUARIOS UNIFICADOS & AGENTES IA ---
  getUsers({ userType = 'all', search = '', limit = 100 } = {}) {
    if (this.isNative) {
      const rows = this.stmts.getAllUsers.all();
      let users = rows.map(r => JSON.parse(r.data));
      if (userType && userType !== 'all') {
        users = users.filter(u => u.userType === userType);
      }
      if (search) {
        const q = search.toLowerCase();
        users = users.filter(u => 
          (u.fullName && u.fullName.toLowerCase().includes(q)) ||
          (u.phone && u.phone.includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      }
      return users.slice(0, limit);
    }
    let users = this.fallbackData.users || [];
    if (userType && userType !== 'all') users = users.filter(u => u.userType === userType);
    return users.slice(0, limit);
  }

  getUserById(id) {
    if (this.isNative) {
      const row = this.stmts.getUserById.get(String(id));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.users || []).find(u => String(u.id) === String(id)) || null;
  }

  getUserByPhone(phone) {
    if (this.isNative) {
      const row = this.stmts.getUserByPhone.get(String(phone));
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.users || []).find(u => String(u.phone) === String(phone)) || null;
  }

  getUserByEmail(email) {
    if (this.isNative) {
      const row = this.stmts.getUserByEmail.get(String(email).toLowerCase());
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.users || []).find(u => u.email?.toLowerCase() === String(email).toLowerCase()) || null;
  }

  getUserByUsername(username) {
    if (!username) return null;
    if (this.isNative) {
      const row = this.stmts.getUserByUsername.get(String(username).trim());
      return row ? JSON.parse(row.data) : null;
    }
    return (this.fallbackData.users || []).find(u => u.username === String(username).trim()) || null;
  }

  getUserByIdentifier(identifier) {
    if (!identifier) return null;
    const str = String(identifier).trim();
    // 1. Probar por ID
    let u = this.getUserById(str);
    if (u) return u;
    // 2. Probar por username
    u = this.getUserByUsername(str);
    if (u) return u;
    // 3. Probar por email si tiene @
    if (str.includes('@')) {
      u = this.getUserByEmail(str);
      if (u) return u;
    }
    // 4. Probar por teléfono
    u = this.getUserByPhone(str);
    if (u) return u;
    // 5. Búsqueda por dígitos
    const digits = str.replace(/\D/g, '');
    if (digits.length >= 8) {
      const all = this.getUsers({ limit: 1000 });
      return all.find(x => x.phone && x.phone.replace(/\D/g, '').endsWith(digits.slice(-8))) || null;
    }
    return null;
  }

  saveUser(u) {
    let existing = null;
    if (u.id) existing = this.getUserById(u.id);
    if (!existing && u.email) existing = this.getUserByEmail(u.email);
    if (!existing && u.phone) existing = this.getUserByPhone(u.phone);
    if (!existing && u.username) existing = this.getUserByUsername(u.username);

    if (existing) {
      if (!u.id) u.id = existing.id;
      if (!u.username) u.username = existing.username;
      u = { ...existing, ...u };
    }

    if (!u.id) u.id = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    const username = u.username || u.email || (u.phone ? u.phone.replace(/\D/g, '') : null) || u.id;
    const role = String(u.role || existing?.role || (u.userType === 'admin' ? 'admin' : (u.userType === 'staff' ? 'cajero' : (u.userType === 'ai_agent' ? 'agente' : 'cliente'))));
    if (this.isNative) {
      this.stmts.upsertUser.run(
        String(u.id),
        String(username),
        String(role),
        String(u.userType || 'customer'),
        u.phone ? String(u.phone) : null,
        u.email ? String(u.email).toLowerCase() : null,
        String(u.fullName || u.name || 'Usuario'),
        u.passwordHash ? String(u.passwordHash) : null,
        u.otpRecord?.hash ? String(u.otpRecord.hash) : null,
        u.otpRecord?.expiresAt ? Number(u.otpRecord.expiresAt) : null,
        u.address ? String(u.address) : null,
        u.neighborhood ? String(u.neighborhood) : null,
        u.postalCode ? String(u.postalCode) : null,
        u.birthDate ? String(u.birthDate) : null,
        String(u.status || 'active'),
        u.aiController ? JSON.stringify(u.aiController) : null,
        u.preferences ? JSON.stringify(u.preferences) : null,
        String(u.createdAt || now),
        now,
        JSON.stringify(u)
      );
    } else {
      if (!this.fallbackData.users) this.fallbackData.users = [];
      const idx = this.fallbackData.users.findIndex(x => x.id === u.id);
      if (idx >= 0) this.fallbackData.users[idx] = u;
      else this.fallbackData.users.unshift(u);
    }
    return u;
  }

  saveUsers(users) {
    for (const u of users) this.saveUser(u);
    return users;
  }

  deleteUser(id) {
    if (this.isNative) this.stmts.deleteUser.run(String(id));
    else if (this.fallbackData.users) {
      this.fallbackData.users = this.fallbackData.users.filter(x => x.id !== id);
    }
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

  optimize() {
    const startTime = Date.now();
    let beforeBytes = 0;
    let afterBytes = 0;

    try {
      if (fs.existsSync(DB_FILE)) {
        beforeBytes = fs.statSync(DB_FILE).size;
      }
    } catch (_) {}

    if (this.isNative && this.db) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        this.db.exec('PRAGMA optimize;');
        this.db.exec('VACUUM;');
        this.db.exec('ANALYZE;');
      } catch (err) {
        console.warn('⚠️ [SQLiteStorage] Error en optimización VACUUM:', err.message);
      }
    }

    try {
      if (fs.existsSync(DB_FILE)) {
        afterBytes = fs.statSync(DB_FILE).size;
      }
    } catch (_) {}

    const freedBytes = Math.max(0, beforeBytes - afterBytes);
    return {
      success: true,
      durationMs: Date.now() - startTime,
      beforeSizeBytes: beforeBytes,
      afterSizeBytes: afterBytes,
      freedBytes,
      freedKb: Math.round(freedBytes / 1024 * 10) / 10,
      timestamp: new Date().toISOString()
    };
  }

  getDetailedStats() {
    const stats = {
      isNative: this.isNative,
      dbFile: DB_FILE,
      jsonFile: JSON_FILE,
      dbSizeBytes: 0,
      walSizeBytes: 0,
      tables: []
    };

    try {
      if (fs.existsSync(DB_FILE)) stats.dbSizeBytes = fs.statSync(DB_FILE).size;
      const walPath = `${DB_FILE}-wal`;
      if (fs.existsSync(walPath)) stats.walSizeBytes = fs.statSync(walPath).size;
    } catch (_) {}

    const tableNames = ['users', 'products', 'orders', 'leads', 'recipes', 'agents', 'branches', 'cash_registers', 'tasks'];

    if (this.isNative && this.db) {
      for (const t of tableNames) {
        try {
          const row = this.db.prepare(`SELECT count(*) as count FROM ${t}`).get();
          stats.tables.push({ name: t, count: row?.count || 0 });
        } catch (_) {
          stats.tables.push({ name: t, count: 0 });
        }
      }
    } else {
      stats.tables = tableNames.map(t => ({
        name: t,
        count: (this.fallbackData?.[t] || []).length
      }));
    }

    return stats;
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

