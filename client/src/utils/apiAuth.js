/**
 * Helper de Autenticación para Peticiones HTTP en WAgent Client
 * Obtiene el token de sesión activo y lo adjunta en Authorization: Bearer <token>
 */

export function getAuthToken() {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem('wagent_session') || '';
  } catch (e) {
    return '';
  }
}

export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('wagent_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function getAuthHeaders(customHeaders = {}) {
  const token = getAuthToken();
  const headers = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const user = getCurrentUser();
  if (user?.id) {
    headers['x-user-id'] = user.id;
  }
  return headers;
}

export async function authFetch(url, options = {}) {
  const mergedOptions = {
    ...options,
    headers: getAuthHeaders(options.headers || {})
  };
  return fetch(url, mergedOptions);
}
