import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Copy, 
  Check, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Filter, 
  Layers,
  Sparkles,
  Eye
} from 'lucide-react';

export default function MediaGalleryModal({
  isOpen,
  onClose,
  onSelectImage = null, // (imageUrl, imageObj) => void
  selectedImageUrl = ''
}) {
  const [mediaFiles, setMediaFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const fetchMedia = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/media');
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setMediaFiles(data.files);
      }
    } catch (err) {
      console.error('Error cargando medios:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen]);

  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/media/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.file) {
          setMediaFiles(prev => [data.file, ...prev.filter(f => f.filename !== data.file.filename)]);
        }
      }
    } catch (err) {
      console.error('Error subiendo archivo:', err);
      alert('Error subiendo imagen. Verifica que sea un formato válido (JPG, PNG, WebP).');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename, e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la imagen "${filename}" de la galería?`)) return;

    try {
      const res = await fetch(`/api/media/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMediaFiles(prev => prev.filter(f => f.filename !== filename));
      }
    } catch (err) {
      console.error('Error eliminando archivo:', err);
    }
  };

  const handleCopy = (url, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(window.location.origin + url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const filteredMedia = mediaFiles.filter(item => 
    item.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.format && item.format.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Galería de Medios e Imágenes
                {onSelectImage && (
                  <span className="text-xs px-2.5 py-0.5 bg-red-500/20 text-red-300 rounded-full font-medium border border-red-500/30">
                    Modo Selección
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400">
                Imágenes optimizadas automáticamente en WebP para máxima velocidad y nitidez en la tienda y CRM.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchMedia}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
              title="Refrescar galería"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Subida y Buscador */}
        <div className="px-6 py-3.5 bg-gray-950/60 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o formato (webp, png...)..."
                className="w-full bg-gray-900 border border-gray-700/80 rounded-xl pl-9 pr-3.5 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-red-900/20 disabled:opacity-50"
            >
              <Upload className={`w-4 h-4 ${isUploading ? 'animate-bounce' : ''}`} />
              <span>{isUploading ? 'Optimizando WebP...' : 'Subir Imágenes'}</span>
            </button>
          </div>
        </div>

        {/* Area Drag & Drop y Grid de Imágenes */}
        <div 
          className={`flex-1 overflow-y-auto p-6 transition-colors custom-scrollbar ${
            dragOver ? 'bg-red-500/5 border-2 border-dashed border-red-500/40' : ''
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
          }}
        >
          {isLoading && mediaFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin text-red-500 mb-3" />
              <p className="text-sm">Cargando biblioteca de imágenes...</p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-gray-800 rounded-2xl p-8">
              <div className="p-4 bg-gray-800/50 rounded-2xl text-gray-600 mb-3">
                <ImageIcon className="w-10 h-10" />
              </div>
              <h3 className="text-base font-semibold text-gray-300 mb-1">
                {searchTerm ? 'No se encontraron imágenes coincidentes' : 'Tu galería está vacía'}
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mb-4">
                Arrastrá y soltá imágenes aquí o hacé clic en "Subir Imágenes" para cargarlas y optimizarlas en formato WebP.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-medium transition-colors"
              >
                Explorar Archivos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredMedia.map((item) => {
                const isSelected = selectedImageUrl && (selectedImageUrl === item.url || selectedImageUrl.includes(item.filename));

                return (
                  <div
                    key={item.filename}
                    onClick={() => {
                      if (onSelectImage) {
                        onSelectImage(item.url, item);
                        onClose();
                      }
                    }}
                    className={`group relative bg-gray-950 border rounded-xl overflow-hidden flex flex-col transition-all duration-200 ${
                      onSelectImage ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl' : ''
                    } ${
                      isSelected 
                        ? 'border-red-500 ring-2 ring-red-500/40 shadow-lg shadow-red-950/50' 
                        : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-900/60 relative overflow-hidden flex items-center justify-center">
                      <img
                        src={item.url}
                        alt={item.filename}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300&auto=format&fit=crop&q=80';
                        }}
                      />

                      {/* Badge Formato */}
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-md rounded text-[10px] font-bold tracking-wider text-gray-300 uppercase border border-white/10">
                        {item.format || 'webp'}
                      </span>

                      {/* Check Selección */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 p-1 bg-red-600 rounded-full text-white shadow-md">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}

                      {/* Botones de acción flotantes en hover */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreviewImage(item); }}
                          className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg transition-colors"
                          title="Ver en grande"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(item.url, e)}
                          className="p-2 bg-gray-800/90 hover:bg-gray-700 text-white rounded-lg transition-colors"
                          title="Copiar link"
                        >
                          {copiedUrl === item.url ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(item.filename, e)}
                          className="p-2 bg-red-950/80 hover:bg-red-800 text-red-200 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="p-2.5 bg-gray-950 border-t border-gray-800/60">
                      <div className="text-xs text-gray-200 font-medium truncate" title={item.filename}>
                        {item.filename}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span>{formatBytes(item.size)}</span>
                        {item.width && item.height && (
                          <span>{item.width}x{item.height}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-800 bg-gray-900/90 flex items-center justify-between text-xs text-gray-400">
          <div>
            Total: <strong className="text-gray-200">{mediaFiles.length}</strong> imágenes optimizadas
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>

      {/* Modal Preview Grande */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[85vh] bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-200 truncate">{previewImage.filename}</span>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-2 flex items-center justify-center bg-black/40">
              <img 
                src={previewImage.url} 
                alt={previewImage.filename} 
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="p-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
              <span>Tamaño: {formatBytes(previewImage.size)}</span>
              {onSelectImage && (
                <button
                  onClick={() => {
                    onSelectImage(previewImage.url, previewImage);
                    setPreviewImage(null);
                    onClose();
                  }}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg"
                >
                  Seleccionar esta imagen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
