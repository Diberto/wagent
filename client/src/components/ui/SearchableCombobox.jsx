import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Search, Plus } from 'lucide-react';

/**
 * SearchableCombobox
 * Permite seleccionar de una lista existente, filtrar en tiempo real,
 * o ingresar cualquier valor personalizado libre si no está en la lista.
 *
 * @param {Array<string|{id: string, label: string, icon?: string}>} options - Opciones disponibles
 * @param {string} value - Valor actual seleccionado o escrito
 * @param {function} onChange - Callback al cambiar el valor: (value, optionObj) => void
 * @param {string} placeholder - Texto placeholder
 * @param {string} className - Clases CSS adicionales para el contenedor
 * @param {boolean} disabled - Estado deshabilitado
 * @param {string} label - Etiqueta superior opcional
 * @param {boolean} allowCustom - Si permite valores no incluidos en options (default true)
 */
export default function SearchableCombobox({
  options = [],
  value = '',
  onChange,
  placeholder = 'Seleccionar o escribir...',
  className = '',
  disabled = false,
  label = null,
  allowCustom = true,
  icon: Icon = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Normalizar opciones a formato { id, label, icon }
  const normalizedOptions = (options || []).map(opt => {
    if (typeof opt === 'string') {
      return { id: opt, label: opt };
    }
    return {
      id: opt.id || opt.value || opt.name || opt.label,
      label: opt.label || opt.name || opt.id || String(opt),
      icon: opt.icon,
      subtitle: opt.subtitle || opt.address
    };
  });

  // Encontrar etiqueta del valor actual
  const currentOption = normalizedOptions.find(opt => 
    String(opt.id).toLowerCase() === String(value).toLowerCase() || 
    String(opt.label).toLowerCase() === String(value).toLowerCase()
  );

  const displayValue = isFocused ? searchTerm : (currentOption ? currentOption.label : (value || ''));

  // Filtrar opciones según búsqueda
  const filteredOptions = normalizedOptions.filter(opt => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return opt.label.toLowerCase().includes(term) || 
           (opt.subtitle && opt.subtitle.toLowerCase().includes(term));
  });

  // Determinar si el término actual es una opción nueva no existente
  const isNewCustomOption = allowCustom && searchTerm.trim() && !normalizedOptions.some(
    opt => opt.label.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  // Manejar clics fuera del componente
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (opt) => {
    const selectedVal = opt.id || opt.label;
    onChange?.(selectedVal, opt);
    setSearchTerm('');
    setIsOpen(false);
    setIsFocused(false);
  };

  const handleCustomSubmit = () => {
    if (allowCustom && searchTerm.trim()) {
      onChange?.(searchTerm.trim(), { id: searchTerm.trim(), label: searchTerm.trim(), isCustom: true });
      setSearchTerm('');
      setIsOpen(false);
      setIsFocused(false);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('', null);
    setSearchTerm('');
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}

      <div 
        className={`relative flex items-center bg-gray-900/90 border rounded-xl transition-all duration-200 ${
          isOpen ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-700 hover:border-gray-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-800/50' : 'cursor-text'}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setIsFocused(true);
            setSearchTerm(value || '');
            if (inputRef.current) inputRef.current.focus();
          }
        }}
      >
        {Icon && (
          <div className="pl-3.5 text-gray-400 pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
            if (allowCustom) {
              onChange?.(e.target.value, null);
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            setSearchTerm(value || '');
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filteredOptions.length > 0) {
                handleSelect(filteredOptions[0]);
              } else if (isNewCustomOption) {
                handleCustomSubmit();
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
              setIsFocused(false);
            }
          }}
          placeholder={placeholder}
          className={`w-full bg-transparent px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none ${
            Icon ? 'pl-2' : ''
          }`}
        />

        <div className="flex items-center pr-2.5 gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
              title="Limpiar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                setIsOpen(!isOpen);
                if (!isOpen && inputRef.current) {
                  inputRef.current.focus();
                  setIsFocused(true);
                  setSearchTerm(value || '');
                }
              }
            }}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-red-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Menú Desplegable */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden max-h-60 flex flex-col backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="overflow-y-auto flex-1 divide-y divide-gray-800/60 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = String(value).toLowerCase() === String(opt.id).toLowerCase() ||
                                   String(value).toLowerCase() === String(opt.label).toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-red-500/15 text-red-300 font-medium'
                        : 'text-gray-200 hover:bg-gray-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {opt.icon && <span className="text-base flex-shrink-0">{opt.icon}</span>}
                      <div className="truncate">
                        <div className="truncate">{opt.label}</div>
                        {opt.subtitle && (
                          <div className="text-xs text-gray-400 truncate">{opt.subtitle}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  </button>
                );
              })
            ) : null}

            {/* Opción para agregar texto libre si no está en la lista */}
            {isNewCustomOption && (
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="w-full text-left px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors border-t border-gray-800"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Usar texto personalizado: <strong>"{searchTerm}"</strong></span>
              </button>
            )}

            {filteredOptions.length === 0 && !isNewCustomOption && (
              <div className="px-3.5 py-4 text-center text-xs text-gray-500">
                No se encontraron opciones.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
