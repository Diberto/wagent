import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';

// Configurar binario de ffmpeg estático
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export class AudioConverter {
  /**
   * Convierte cualquier audio (mp3, wav, etc.) a formato WhatsApp PTT (.ogg con Opus mono 48kHz)
   * @param {string|Buffer} input - Ruta del archivo o Buffer
   * @returns {Promise<string>} Ruta del archivo OGG generado
   */
  static async convertToWhatsAppPtt(input) {
    const outputFilename = `ptt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.ogg`;
    const outputPath = path.join(CONFIG.MEDIA_DIR, outputFilename);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      if (Buffer.isBuffer(input)) {
        const tempInputPath = path.join(CONFIG.MEDIA_DIR, `temp_${Date.now()}.mp3`);
        fs.writeFileSync(tempInputPath, input);
        command = command.input(tempInputPath);
        
        // Limpiar archivo temporal al finalizar
        const cleanup = () => {
          try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch (e) {}
        };
        
        command
          .audioCodec('libopus')
          .audioChannels(1)
          .audioFrequency(48000)
          .audioBitrate('48k')
          .outputOptions([
            '-avoid_negative_ts make_zero',
            '-map_metadata -1'
          ])
          .toFormat('ogg')
          .on('end', () => {
            cleanup();
            resolve(outputPath);
          })
          .on('error', (err) => {
            cleanup();
            console.error('FFmpeg PTT conversion error:', err);
            reject(err);
          })
          .save(outputPath);
      } else {
        command
          .input(input)
          .audioCodec('libopus')
          .audioChannels(1)
          .audioFrequency(48000)
          .audioBitrate('48k')
          .outputOptions([
            '-avoid_negative_ts make_zero',
            '-map_metadata -1'
          ])
          .toFormat('ogg')
          .on('end', () => resolve(outputPath))
          .on('error', (err) => {
            console.error('FFmpeg PTT conversion error:', err);
            reject(err);
          })
          .save(outputPath);
      }
    });
  }

  /**
   * Convierte un audio de WhatsApp (.ogg / opus) a MP3 para reproducción web o análisis
   * @param {string|Buffer} input - Ruta o Buffer
   * @returns {Promise<string>} Ruta del archivo MP3
   */
  static async convertOggToMp3(input) {
    const outputFilename = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.mp3`;
    const outputPath = path.join(CONFIG.MEDIA_DIR, outputFilename);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();
      let tempInputPath = null;

      if (Buffer.isBuffer(input)) {
        tempInputPath = path.join(CONFIG.MEDIA_DIR, `temp_raw_${Date.now()}.ogg`);
        fs.writeFileSync(tempInputPath, input);
        command = command.input(tempInputPath);
      } else {
        command = command.input(input);
      }

      const cleanup = () => {
        if (tempInputPath && fs.existsSync(tempInputPath)) {
          try { fs.unlinkSync(tempInputPath); } catch (e) {}
        }
      };

      command
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .toFormat('mp3')
        .on('end', () => {
          cleanup();
          resolve(outputPath);
        })
        .on('error', (err) => {
          cleanup();
          console.error('FFmpeg MP3 conversion error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Convierte un archivo de audio a WAV mono 16kHz (ideal para Speech-to-Text)
   */
  static async convertToWavForStt(input) {
    const outputFilename = `stt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.wav`;
    const outputPath = path.join(CONFIG.MEDIA_DIR, outputFilename);

    return new Promise((resolve, reject) => {
      let command = ffmpeg();
      let tempInputPath = null;

      if (Buffer.isBuffer(input)) {
        tempInputPath = path.join(CONFIG.MEDIA_DIR, `temp_stt_in_${Date.now()}.ogg`);
        fs.writeFileSync(tempInputPath, input);
        command = command.input(tempInputPath);
      } else {
        command = command.input(input);
      }

      const cleanup = () => {
        if (tempInputPath && fs.existsSync(tempInputPath)) {
          try { fs.unlinkSync(tempInputPath); } catch (e) {}
        }
      };

      command
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat('wav')
        .on('end', () => {
          cleanup();
          resolve(outputPath);
        })
        .on('error', (err) => {
          cleanup();
          console.error('FFmpeg WAV conversion error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }
}
