import exifr from 'exifr';
import { Logger } from '~/services/logger';
import type { PngChunk, PngMetadata, ImageMetadataDefinition } from '~/types/image';

const logger = Logger.getLogger('ImageMetadata');

function readPngChunks(data: ArrayBuffer): PngChunk[] {
  const view = new DataView(data);
  const chunks: PngChunk[] = [];
  let offset = 8; // Skip PNG signature

  while (offset < data.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    const chunkData = new Uint8Array(data, offset + 8, length);
    const crc = view.getUint32(offset + 8 + length);

    chunks.push({ length, type, data: chunkData, crc });
    offset += 12 + length;
  }

  return chunks;
}

async function extractPngMetadata(file: File): Promise<Partial<PngMetadata>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const chunks = readPngChunks(buffer);

        logger.debug(
          'Found PNG chunks:',
          chunks.map(c => ({ type: c.type, length: c.length }))
        );

        const metadata: Record<string, string> = {};

        for (const chunk of chunks) {
          if (chunk.type === 'tEXt') {
            const text = new TextDecoder().decode(chunk.data);
            const tEXtData = gettEXtKeyValue(text);

            if (tEXtData) {
              metadata[tEXtData.key] = tEXtData.value;
            }
          }
          if (chunk.type === 'iTXt') {
            const text = new TextDecoder().decode(chunk.data);
            const iTXtData = getiTXtKeyValue(text);

            if (iTXtData) {
              metadata[iTXtData.key] = iTXtData.value;
            }
          }
        }

        logger.debug('Extracted PNG metadata:', metadata);

        resolve({
          title: metadata.Title || metadata.title,
          author: metadata.Author || metadata.author,
          description:
            metadata.Description || metadata.description || metadata.Comment || metadata.comment,
          copyright: metadata.Copyright || metadata.copyright,
          creationTime: metadata.CreationTime || metadata.creationTime || metadata.Creation_Time,
          software: metadata.Software || metadata.software || metadata.Creator || metadata.creator,
        });
      } catch (error) {
        logger.warn('Failed to extract PNG metadata:', error);
        resolve({});
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function extractMetadata(
  file: File,
  img: HTMLImageElement
): Promise<Partial<ImageMetadataDefinition>> {
  // Basic file metadata
  const basicMetadata: Partial<ImageMetadataDefinition> = {
    dateCreated: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    dateModified: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    mimeType: file.type,
    fileSize: file.size,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
  };

  try {
    if (file.type === 'image/png') {
      // Extract PNG metadata
      const pngMetadata = await extractPngMetadata(file);
      // Ensure all required fields are present for PngMetadata
      const fullPngMetadata = {
        title: pngMetadata.title || '',
        author: pngMetadata.author || '',
        description: pngMetadata.description || '',
        copyright: pngMetadata.copyright || '',
        creationTime: pngMetadata.creationTime || '',
        software: pngMetadata.software || '',
      };
      return {
        ...basicMetadata,
        png: fullPngMetadata,
      };
    } else {
      // Extract EXIF metadata for other formats
      const exif = await exifr.parse(file, {
        pick: [
          'Make',
          'Model',
          'DateTimeOriginal',
          'CreateDate',
          'ModifyDate',
          'ISO',
          'FNumber',
          'ExposureTime',
          'FocalLength',
          'GPSLatitude',
          'GPSLongitude',
          'ImageDescription',
          'Copyright',
          'Artist',
        ],
      });

      return {
        ...basicMetadata,
        exif: exif
          ? {
              camera: exif.Make ? `${exif.Make} ${exif.Model}` : undefined,
              dateOriginal: exif.DateTimeOriginal?.toISOString(),
              iso: exif.ISO,
              aperture: exif.FNumber ? `f/${exif.FNumber}` : undefined,
              exposureTime: exif.ExposureTime
                ? `1/${Math.round(1 / exif.ExposureTime)}`
                : undefined,
              focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : undefined,
              gpsCoordinates:
                exif.GPSLatitude && exif.GPSLongitude
                  ? { lat: exif.GPSLatitude, lng: exif.GPSLongitude }
                  : undefined,
              description: exif.ImageDescription,
              copyright: exif.Copyright,
              artist: exif.Artist,
            }
          : undefined,
      };
    }
  } catch (error) {
    logger.warn('Failed to extract metadata:', error);
    return basicMetadata;
  }
}

function gettEXtKeyValue(text: string): { key: string; value: string } | undefined {
  const [key, value] = text.split('\0');

  if (key && value) {
    logger.debug('Found tEXt chunk:', { key, value });
    return { key, value };
  }
}

function getiTXtKeyValue(text: string): { key: string; value: string } | undefined {
  const parts = text.split('\0');
  if (parts.length >= 5) {
    const [key, , , , value] = parts;

    if (key && value) {
      logger.debug('Found iTXt chunk:', { key, value });
      return { key, value };
    }
  }
}
