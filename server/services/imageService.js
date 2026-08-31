import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config/index.js';

export class ImageService {
  /**
   * Procesa y optimiza una imagen a formato WebP con dimensiones máximas de 1080x1920 o 1920x1080
   * @param {Buffer|string} input - Buffer de la imagen o ruta del archivo de entrada
   * @param {string} [customFilename] - Nombre de archivo personalizado opcional
   * @returns {Promise<{ filename: string, url: string, filePath: string, width: number, height: number, size: number, format: string }>}
   */
  static async processAndOptimizeImage(input, customFilename = null) {
    try {
      const mediaDir = CONFIG.MEDIA_DIR;
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      const filename = customFilename 
        ? `${path.parse(customFilename).name}.webp`
        : `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.webp`;

      const outputPath = path.join(mediaDir, filename);

      // Instancia de Sharp con auto-rotación EXIF
      const pipeline = sharp(input).rotate();

      // Obtener metadatos para determinar orientación
      const metadata = await pipeline.metadata();
      const isPortrait = (metadata.height || 0) > (metadata.width || 0);

      // Límites: 1080x1920 (vertical/portrait) o 1920x1080 (horizontal/landscape)
      const targetMaxWidth = isPortrait ? 1080 : 1920;
      const targetMaxHeight = isPortrait ? 1920 : 1080;

      const info = await pipeline
        .resize({
          width: targetMaxWidth,
          height: targetMaxHeight,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({
          quality: 85,
          effort: 4,
          lossless: false
        })
        .toFile(outputPath);

      return {
        filename,
        url: `/media/${filename}`,
        filePath: outputPath,
        width: info.width,
        height: info.height,
        size: info.size,
        format: 'webp'
      };
    } catch (error) {
      console.error('Error procesando y optimizando imagen a WebP:', error);
      throw error;
    }
  }

  /**
   * Middleware de Multer para optimizar imágenes cargadas automáticamente a WebP
   */
  static async handleUploadedImage(file) {
    if (!file) return null;
    const result = await this.processAndOptimizeImage(file.path || file.buffer, file.originalname);
    
    // Si multer guardó un archivo temporal original con otra extensión, eliminar el temporal
    if (file.path && fs.existsSync(file.path) && file.path !== result.filePath) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // Silencioso
      }
    }
    return result;
  }
}

export const imageService = ImageService;
