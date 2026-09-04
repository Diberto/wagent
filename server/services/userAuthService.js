import crypto from 'crypto';
import { sqliteStorage } from './sqliteStorage.js';
import { db } from './database.js';
import { normalizePhoneNumber } from './database.js';

// Clave secreta para tokens firmados HMAC-SHA256 (persistida o derivada de entorno)
const AUTH_SECRET = process.env.JWT_SECRET || 'wagent_auth_secret_key_republica_carne_2026';

/**
 * Servicio Central de Autenticación, Cuentas de Usuario y Agentes de IA
 * Provee: Hashing seguro con scrypt, tokens HMAC-SHA256, OTP multicanal y validación 7/7
 */
export class UserAuthService {
  /**
   * Hashea una contraseña usando scrypt con sal aleatoria criptográfica
   */
  static hashPassword(password) {
    if (!password || typeof password !== 'string' || password.length < 4) {
      throw new Error('La contraseña debe tener al menos 4 caracteres');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  /**
   * Verifica una contraseña contra su hash scrypt usando comparación en tiempo constante
   */
  static verifyPassword(password, storedHash) {
    try {
      if (!password || !storedHash || !storedHash.startsWith('scrypt$')) return false;
      const parts = storedHash.split('$');
      if (parts.length !== 3) return false;
      const salt = parts[1];
      const originalKey = Buffer.from(parts[2], 'hex');
      const derivedKey = crypto.scryptSync(password, salt, 64);
      return crypto.timingSafeEqual(originalKey, derivedKey);
    } catch (e) {
      return false;
    }
  }

  /**
   * Genera un token firmado HMAC-SHA256 (formato Header.Payload.Signature)
   */
  static generateToken(user, expiresInHours = 168) { // 7 días por defecto
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      phone: user.phone,
      email: user.email,
      name: user.fullName || user.name,
      userType: user.userType || 'customer',
      role: user.role || (user.userType === 'admin' ? 'admin' : 'user'),
      exp
    })).toString('base64url');

    const signature = crypto.createHmac('sha256', AUTH_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Verifica y decodifica un token firmado
   */
  static verifyToken(token) {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }

      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expirado
      }

      return decodedPayload;
    } catch (e) {
      return null;
    }
  }

  /**
   * Genera un código OTP de 6 dígitos con validez de 10 minutos
   */
  static generateOtp() {
    const code = crypto.randomInt(100000, 999999).toString();
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = crypto.scryptSync(code, salt, 32).toString('hex');
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutos
    return {
      code, // Se entrega una sola vez para enviar al usuario
      otpRecord: {
        hash: `otp$${salt}$${hash}`,
        expiresAt,
        attempts: 0
      }
    };
  }

  /**
   * Valida un código OTP de 6 dígitos
   */
  static verifyOtpCode(inputCode, otpRecord) {
    try {
      if (!inputCode || !otpRecord || !otpRecord.hash) return { valid: false, reason: 'Código inexistente' };
      if (Date.now() > (otpRecord.expiresAt || 0)) return { valid: false, reason: 'El código ha expirado (10 min)' };
      if ((otpRecord.attempts || 0) >= 3) return { valid: false, reason: 'Demasiados intentos fallidos' };

      const parts = otpRecord.hash.split('$');
      if (parts.length !== 3) return { valid: false, reason: 'Formato interno de OTP inválido' };
      const salt = parts[1];
      const originalKey = Buffer.from(parts[2], 'hex');
      const derivedKey = crypto.scryptSync(String(inputCode).trim(), salt, 32);

      const isMatch = crypto.timingSafeEqual(originalKey, derivedKey);
      if (!isMatch) {
        otpRecord.attempts = (otpRecord.attempts || 0) + 1;
        return { valid: false, reason: 'Código incorrecto' };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  /**
   * Evalúa la completitud del perfil según los 7 datos canónicos obligatorios
   */
  static evaluateProfileCompleteness(profile = {}) {
    const rawName = (profile.fullName || profile.name || '').trim();
    const rawPhone = (profile.phone || '').trim();
    const rawAddress = (profile.address || '').trim();
    const rawNeighborhood = (profile.neighborhood || profile.barrio || '').trim();
    const rawPostalCode = (profile.postalCode || profile.postal_code || profile.codigoPostal || '').trim();
    const rawEmail = (profile.email || '').trim();
    const rawBirthDate = (profile.birthDate || profile.birth_date || profile.fechaNacimiento || '').trim();

    const missing = [];
    if (!rawName || rawName.length < 3) missing.push('fullName');
    if (!rawPhone || rawPhone.length < 8) missing.push('phone');
    if (!rawAddress || rawAddress.length < 4) missing.push('address');
    if (!rawNeighborhood || rawNeighborhood.length < 3) missing.push('neighborhood');
    if (!rawPostalCode || rawPostalCode.length < 3) missing.push('postalCode');
    if (!rawEmail || !rawEmail.includes('@') || !rawEmail.includes('.')) missing.push('email');
    if (!rawBirthDate || rawBirthDate.length < 4) missing.push('birthDate');

    const isComplete = missing.length === 0;
    const score = Math.round(((7 - missing.length) / 7) * 100);

    return {
      isComplete,
      score,
      missing,
      normalized: {
        fullName: rawName,
        phone: normalizePhoneNumber(rawPhone) || rawPhone,
        address: rawAddress,
        neighborhood: rawNeighborhood,
        postalCode: rawPostalCode,
        email: rawEmail.toLowerCase(),
        birthDate: rawBirthDate
      }
    };
  }

  /**
   * Registra o actualiza un usuario en la capa de persistencia (SQLite WAL + JSON)
   */
  static async registerOrUpdateUser(userData) {
    const cleanPhone = normalizePhoneNumber(userData.phone) || userData.phone || '';
    const cleanEmail = (userData.email || '').trim().toLowerCase();
    const fullName = (userData.fullName || userData.name || '').trim();
    const userType = userData.userType || (userData.isAIAgent ? 'ai_agent' : 'customer');

    // Buscar si ya existe por ID, email o teléfono
    let existing = null;
    if (userData.id) {
      existing = await this.findUserByIdentifier(userData.id);
    }
    if (!existing && cleanEmail) {
      existing = await this.findUserByIdentifier(cleanEmail);
    }
    if (!existing && cleanPhone) {
      existing = await this.findUserByIdentifier(cleanPhone);
    }

    const id = userData.id || existing?.id || `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const mergedData = { ...(existing || {}), ...userData, id };
    const completeness = this.evaluateProfileCompleteness(mergedData);

    const userEntity = {
      ...(existing || {}),
      id,
      userType: userData.userType || existing?.userType || userType,
      fullName: fullName || existing?.fullName || '',
      name: fullName || existing?.name || '',
      phone: cleanPhone || existing?.phone || '',
      email: cleanEmail || existing?.email || '',
      address: userData.address !== undefined ? userData.address : (existing?.address || ''),
      neighborhood: userData.neighborhood !== undefined ? (userData.neighborhood || userData.barrio || '') : (existing?.neighborhood || ''),
      postalCode: userData.postalCode !== undefined ? (userData.postalCode || userData.postal_code || '') : (existing?.postalCode || ''),
      birthDate: userData.birthDate !== undefined ? (userData.birthDate || userData.birth_date || '') : (existing?.birthDate || ''),
      status: userData.status || existing?.status || 'active',
      profileStatus: completeness.isComplete ? 'VERIFIED_COMPLETE' : 'ONBOARDING',
      completenessScore: completeness.score,
      passwordHash: userData.password ? this.hashPassword(userData.password) : (userData.passwordHash || existing?.passwordHash || null),
      otpRecord: userData.otpRecord !== undefined ? userData.otpRecord : (existing?.otpRecord || null),
      preferences: {
        theme: 'dark_asador',
        accentColor: '#e53935',
        defaultView: userType === 'staff' ? 'pos' : (userType === 'ai_agent' ? 'inbox' : 'store'),
        favoriteCuts: [],
        ...(existing?.preferences || {}),
        ...(userData.preferences || {})
      },
      // Sub-estructura para Agentes de IA
      aiController: (userType === 'ai_agent' || existing?.aiController) ? {
        provider: userData.aiController?.provider || existing?.aiController?.provider || 'gemini',
        model: userData.aiController?.model || existing?.aiController?.model || 'gemini-1.5-flash-latest',
        temperature: userData.aiController?.temperature ?? existing?.aiController?.temperature ?? 0.4,
        systemRole: userData.aiController?.systemRole || existing?.aiController?.systemRole || 'Asistente y maestro carnicero experto en República de la Carne',
        assignedTools: userData.aiController?.assignedTools || existing?.aiController?.assignedTools || ['query_catalog', 'calculate_portions', 'create_order'],
        assignedBranchId: userData.aiController?.assignedBranchId || existing?.aiController?.assignedBranchId || 'default',
        ...(existing?.aiController || {}),
        ...(userData.aiController || {})
      } : null,
      createdAt: existing?.createdAt || userData.createdAt || now,
      updatedAt: now
    };

    // 1. Guardar en SQLite WAL
    try {
      if (sqliteStorage && typeof sqliteStorage.saveUser === 'function') {
        sqliteStorage.saveUser(userEntity);
      }
    } catch (e) {
      console.warn('⚠️ Error guardando usuario en SQLite:', e.message);
    }

    // 2. Guardar en db.json (mirror)
    try {
      const currentDb = db.readDb();
      if (!Array.isArray(currentDb.users)) currentDb.users = [];
      const idx = currentDb.users.findIndex(u => u.id === id || (cleanPhone && u.phone === cleanPhone) || (cleanEmail && u.email === cleanEmail));
      if (idx >= 0) {
        currentDb.users[idx] = { ...currentDb.users[idx], ...userEntity, updatedAt: now };
      } else {
        currentDb.users.unshift(userEntity);
      }
      db.writeDb(currentDb);
    } catch (e) {
      console.warn('⚠️ Error guardando usuario en db.json:', e.message);
    }

    return userEntity;
  }

  /**
   * Autentica un usuario por email o teléfono con contraseña
   */
  static async authenticate({ identifier, password }) {
    if (!identifier || !password) throw new Error('Se requiere identificador y contraseña');
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new Error('Usuario no encontrado');
    if (!user.passwordHash) throw new Error('Este usuario no tiene contraseña establecida. Utiliza recuperación por WhatsApp o email.');

    const isMatch = this.verifyPassword(password, user.passwordHash);
    if (!isMatch) throw new Error('Contraseña incorrecta');

    const token = this.generateToken(user);
    const sanitizedUser = this.sanitizeUser(user);
    return { success: true, token, user: sanitizedUser };
  }

  /**
   * Busca un usuario por ID, teléfono o email
   */
  static async findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim();
    const cleanPhone = normalizePhoneNumber(cleanId) || cleanId;
    const cleanEmail = cleanId.toLowerCase();

    // 1. Intentar en SQLite WAL
    try {
      if (sqliteStorage && typeof sqliteStorage.getUserByIdentifier === 'function') {
        const u = sqliteStorage.getUserByIdentifier(cleanId);
        if (u) return u;
      }
    } catch (e) {}

    // 2. Fallback en db.json
    try {
      const currentDb = db.readDb();
      const users = currentDb.users || [];
      return users.find(u => 
        u.id === cleanId || 
        (cleanPhone && (u.phone === cleanPhone || u.phone?.replace(/\D/g, '') === cleanPhone.replace(/\D/g, ''))) ||
        (cleanEmail && u.email?.toLowerCase() === cleanEmail)
      ) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Inicia el proceso de recuperación de contraseña con OTP
   */
  static async initiatePasswordReset(identifier) {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new Error('No se encontró un usuario con ese identificador');

    const { code, otpRecord } = this.generateOtp();
    user.otpRecord = otpRecord;
    user.updatedAt = new Date().toISOString();

    // Actualizar usuario con OTP
    await this.registerOrUpdateUser(user);

    return {
      success: true,
      code, // Para ser despachado por WhatsApp y/o Email
      phone: user.phone,
      email: user.email,
      fullName: user.fullName || user.name
    };
  }

  /**
   * Valida OTP y establece nueva contraseña
   */
  static async completePasswordReset({ identifier, otp, newPassword }) {
    if (!newPassword || newPassword.length < 4) throw new Error('La nueva contraseña debe tener al menos 4 caracteres');
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new Error('Usuario no encontrado');

    const valRes = this.verifyOtpCode(otp, user.otpRecord);
    if (!valRes.valid) throw new Error(valRes.reason || 'Código de seguridad inválido');

    // Hashear y guardar nueva clave
    user.passwordHash = this.hashPassword(newPassword);
    user.otpRecord = null; // Consumido
    user.updatedAt = new Date().toISOString();

    await this.registerOrUpdateUser(user);

    const token = this.generateToken(user);
    return { success: true, token, message: 'Contraseña actualizada con éxito', user: this.sanitizeUser(user) };
  }

  /**
   * Obtiene la lista de usuarios filtrados (soporta separar clientes de agentes de IA)
   */
  static async getUsers({ userType = 'all', search = '', limit = 100 } = {}) {
    let users = [];

    // 1. Obtener desde SQLite WAL si está disponible
    try {
      if (sqliteStorage && typeof sqliteStorage.getUsers === 'function') {
        users = sqliteStorage.getUsers({ userType, search, limit });
      }
    } catch (e) {}

    // 2. Si SQLite no retornó, usar db.json
    if (!users || users.length === 0) {
      try {
        const currentDb = db.readDb();
        users = currentDb.users || [];
      } catch (e) {}
    }

    if (userType && userType !== 'all') {
      users = users.filter(u => u.userType === userType);
    }

    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u => 
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.neighborhood && u.neighborhood.toLowerCase().includes(q))
      );
    }

    return users.slice(0, limit).map(u => this.sanitizeUser(u));
  }

  /**
   * Remueve campos sensibles antes de enviar al frontend
   */
  static sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, otpRecord, ...safe } = user;
    return safe;
  }
}

export const userAuthService = UserAuthService;
export default UserAuthService;

