import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../services/database.js';
import { sqliteStorage } from '../services/sqliteStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadAndParseOfficialCatalog() {
  const csvPath = path.join(__dirname, '../data/official_catalog.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split(/\r?\n/);
  
  const products = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 9) continue;
    
    const plu = (parts[0] || '').trim();
    const barcode = (parts[1] || '').trim();
    const sku = (parts[2] || '').trim();
    const name = (parts[3] || '').trim();
    const category = (parts[4] || 'Carnicería').trim();
    const rawPrice = (parts[5] || '0').trim().replace(',', '.');
    const unit = (parts[6] || 'kg').trim();
    const stock = parseFloat((parts[7] || '100').replace(',', '.')) || 0;
    const disponible = (parts[8] || 'Sí').trim().toUpperCase();
    const description = (parts[9] || '').trim();

    const price = parseFloat(rawPrice) || 0;

    // Regla del usuario: Productos con valor 0 (o placeholder <= 1) o Disponible NO quedan completamente desactivados
    const isZeroOrPlaceholder = price <= 1 || isNaN(price);
    const isExplicitlyDisabled = disponible === 'NO';
    const isAvailable = !isZeroOrPlaceholder && !isExplicitlyDisabled;

    const id = `prod_${sku ? sku.replace(/[^a-zA-Z0-9_-]/g, '') : ''}_${i}`;

    products.push({
      id,
      plu,
      barcode,
      sku: sku || (plu ? `PLU-${plu}` : `SKU-${i}`),
      name,
      category,
      price: isZeroOrPlaceholder ? 0 : price,
      unitPrice: isZeroOrPlaceholder ? 0 : price,
      unit: unit || 'kg',
      stock,
      isAvailable,
      available: isAvailable,
      is_available: isAvailable ? 1 : 0,
      status: isAvailable ? 'active' : 'inactive',
      isAvailableDelivery: isAvailable,
      isAvailableCounter: isAvailable,
      minOrder: unit === 'kg' ? 0.5 : 1,
      description: description || `${name} - Categoría: ${category}`
    });
  }

  return products;
}

export function reseedCatalog() {
  const products = loadAndParseOfficialCatalog();
  console.log(`📦 Total productos parseados del CSV oficial: ${products.length}`);
  const activeCount = products.filter(p => p.isAvailable).length;
  const inactiveCount = products.filter(p => !p.isAvailable).length;
  console.log(`✅ Activos (precio > 1 y disponibles): ${activeCount}`);
  console.log(`🚫 Desactivados completamente (precio 0/placeholder o No disponible): ${inactiveCount}`);

  // 1. Limpiar productos viejos en sqliteStorage
  if (sqliteStorage.isNative) {
    sqliteStorage.db.prepare('DELETE FROM products').run();
  } else {
    sqliteStorage.fallbackData.products = [];
  }

  // 2. Guardar todos en SQLite
  sqliteStorage.saveProducts(products);

  // 3. Guardar en database.js y db.json
  const rawDb = db.readDb();
  rawDb.products = products;
  db.writeDb(rawDb);

  console.log('🎉 [Catálogo] Base de datos resembrada con éxito con el catálogo oficial.');
  return products;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  reseedCatalog();
  process.exit(0);
}
