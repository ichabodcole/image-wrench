import type { ImageFormat } from '~/constants/image';
import { Logger } from '~/services/logger';
import { loadImage } from './data';
import { getBase64Data } from '~/data/base64';

const logger = Logger.getLogger('ImageResizing');

interface ResizeOptions {
  format?: ImageFormat;
  quality?: number;
}

/**
 * Calculates new dimensions while maintaining aspect ratio
 */
export function calculateDimensions(width: number, height: number, maxDimension: number) {
  logger.debug('calculateDimensions input:', { width, height, maxDimension });

  if (width <= maxDimension && height <= maxDimension) {
    logger.debug('No resize needed, using original dimensions:', { width, height });
    return { width, height };
  }

  const aspectRatio = width / height;
  let newWidth = width;
  let newHeight = height;

  if (width > height) {
    newWidth = maxDimension;
    newHeight = Math.round(maxDimension / aspectRatio);
  } else {
    newHeight = maxDimension;
    newWidth = Math.round(maxDimension * aspectRatio);
  }

  logger.debug('calculateDimensions output:', {
    originalWidth: width,
    originalHeight: height,
    newWidth,
    newHeight,
    aspectRatio,
  });

  return { width: newWidth, height: newHeight };
}

/**
 * Resizes a base64 image to a specified maximum dimension while maintaining aspect ratio
 * @param base64Data The base64 image data to resize
 * @param maxDimension Maximum width or height
 * @param options Optional format and quality settings
 * @returns Promise resolving to the resized base64 image data
 */
export async function resizeImageBase64(
  base64Data: string,
  maxDimension: number,
  options: ResizeOptions = {}
): Promise<string> {
  try {
    // Create an image element to load the base64 data
    const img = await loadImage(base64Data);

    // Calculate new dimensions
    const { width: newWidth, height: newHeight } = calculateDimensions(
      img.width,
      img.height,
      maxDimension
    );

    // If no resize needed and no format/quality changes requested, return original
    if (newWidth === img.width && newHeight === img.height && !options.format && !options.quality) {
      return base64Data;
    }

    // Create ImageBitmap for high-quality resizing
    const bitmap = await createImageBitmap(img, {
      resizeWidth: newWidth,
      resizeHeight: newHeight,
      resizeQuality: 'high',
    });

    // Use OffscreenCanvas for better performance
    const offscreen = new OffscreenCanvas(newWidth, newHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Draw resized image
    ctx.drawImage(bitmap, 0, 0);

    // Convert to desired format
    const mimeType = options.format
      ? `image/${options.format.toLowerCase()}`
      : getBase64Data(base64Data).mimeType || 'image/png';

    const quality = options.quality !== undefined ? options.quality / 100 : 0.92;

    logger.debug('Resizing image:', {
      originalWidth: img.width,
      originalHeight: img.height,
      newWidth,
      newHeight,
      format: mimeType,
      quality,
    });

    // Convert to blob with specified format and quality
    const blob = await offscreen.convertToBlob({
      type: mimeType,
      quality,
    });

    // Convert blob to base64
    const base64 = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    // Clean up resources
    bitmap.close();

    return base64;
  } catch (error) {
    logger.error('Failed to resize image:', error);
    throw new Error('Failed to resize image', { cause: error });
  }
}

/**
 * Resizes an image Blob to a specified maximum dimension while maintaining aspect ratio
 * @param imageBlob The image Blob to resize
 * @param maxDimension Maximum width or height
 * @param options Optional format and quality settings
 * @returns Promise resolving to the resized image Blob
 */
export async function resizeImageBlob(
  imageBlob: Blob,
  maxDimension: number,
  options: ResizeOptions = {}
): Promise<Blob> {
  try {
    // Create an image element to load the blob
    const img = await loadImage(URL.createObjectURL(imageBlob));

    // Calculate new dimensions
    const { width: newWidth, height: newHeight } = calculateDimensions(
      img.width,
      img.height,
      maxDimension
    );

    // If no resize needed and no format/quality changes requested, return original blob
    if (newWidth === img.width && newHeight === img.height && !options.format && !options.quality) {
      return imageBlob;
    }

    // Create ImageBitmap for high-quality resizing
    const bitmap = await createImageBitmap(img, {
      resizeWidth: newWidth,
      resizeHeight: newHeight,
      resizeQuality: 'high',
    });

    // Use OffscreenCanvas for better performance
    const offscreen = new OffscreenCanvas(newWidth, newHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Draw resized image
    ctx.drawImage(bitmap, 0, 0);

    // Convert to desired format
    let mimeType = imageBlob.type || 'image/png';
    if (options.format) {
      mimeType = `image/${options.format.toLowerCase()}`;
    }
    const quality = options.quality !== undefined ? options.quality / 100 : 0.92;

    logger.debug('Resizing image blob:', {
      originalWidth: img.width,
      originalHeight: img.height,
      newWidth,
      newHeight,
      format: mimeType,
      quality,
    });

    // Convert to blob with specified format and quality
    const resizedBlob = await offscreen.convertToBlob({
      type: mimeType,
      quality,
    });

    // Clean up resources
    bitmap.close();
    URL.revokeObjectURL(img.src);

    return resizedBlob;
  } catch (error) {
    logger.error('Failed to resize image blob:', error);
    throw new Error('Failed to resize image blob', { cause: error });
  }
}
