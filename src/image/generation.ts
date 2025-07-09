import { Logger } from '~/services/logger';
import type { ImageThumbnailDefinition } from '~/types/image';
import { calculateDimensions } from '@/image/resize';
import { calculateColorVariance } from '@/color/processing';
import { getBase64Data } from '@/data/base64';
import { loadImage } from '@/image/data';
import {
  IMAGE_THUMBNAIL_QUALITY_HIGH,
  IMAGE_THUMBNAIL_QUALITY_LOW,
  ImageFormat,
} from '~/constants/image';

const logger = Logger.getLogger('ImageProcessing');

/**
 * Generates a hash and thumbnail for an image file
 * @param file The image file to generate a hash and thumbnail for
 * @returns The image hash and thumbnail data
 */
export async function generateImageHashAndThumbnail(
  file: File,
  thumbnailSize: number,
  // This is the minimum quality of the thumbnail.
  minOutputQuality: number = IMAGE_THUMBNAIL_QUALITY_LOW,
  // This is the maximum quality of the thumbnail.
  maxOutputQuality: number = IMAGE_THUMBNAIL_QUALITY_HIGH,
  // This is the format of the thumbnail.
  imageFormat: ImageFormat = ImageFormat.WEBP,
  // This is the threshold for the average variance of the image.
  // If the average variance is less than this threshold, the image is considered flat and the quality is set to maxOutputQuality.
  // If the average variance is greater than this threshold, the image is considered detailed and the quality is set to minOutputQuality.
  varianceThreshold: number = 1000
): Promise<{
  imageHash: string;
  thumbnail: ImageThumbnailDefinition;
}> {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);

  const maxDimensions = calculateDimensions(img.naturalWidth, img.naturalHeight, thumbnailSize);

  // Create an ImageBitmap from the loaded image
  const bitmap = await createImageBitmap(img, {
    resizeWidth: maxDimensions.width,
    resizeHeight: maxDimensions.height,
    resizeQuality: 'high',
  });

  // Use OffscreenCanvas for better encoding
  const offscreen = new OffscreenCanvas(maxDimensions.width, maxDimensions.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Draw the bitmap to the offscreen canvas
  ctx.drawImage(bitmap, 0, 0);

  // Calculate color variance to determine optimal quality
  const variance = calculateColorVariance(offscreen);
  const averageVariance = (variance.r + variance.g + variance.b) / 3;

  logger.debug('Average variance:', averageVariance);

  // Adjust quality based on variance:
  // - Low variance (flat colors) -> use higher quality since compression artifacts are more visible
  // - High variance (lots of detail) -> use base quality since artifacts are less noticeable
  const quality =
    averageVariance < varianceThreshold
      ? maxOutputQuality // Perfect quality for flat colors/gradients
      : minOutputQuality; // Base quality for detailed images

  // Convert to blob with adaptive quality
  const blob = await offscreen.convertToBlob({
    type: imageFormat,
    quality,
  });

  const imageHash = await generateImageHashFromBlob(blob);

  // Clean up resources
  bitmap.close();
  URL.revokeObjectURL(url);

  return {
    imageHash,
    thumbnail: {
      data: blob, // Return the Blob instead of base64 string
      width: maxDimensions.width,
      height: maxDimensions.height,
    },
  };
}

export async function generateImageHashFromBase64(base64Data: string): Promise<string> {
  // Remove the data URL prefix if present
  const { base64 } = getBase64Data(base64Data);

  const binaryString = atob(base64); // Decode base64 to binary string
  const byteArray = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', byteArray); // Hash the byte array
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // Convert buffer to byte array
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // Convert bytes to hex string

  return hashHex; // Return the hash as a hex string
}

/**
 * Generates a hash for an image Blob
 * @param imageBlob The image Blob to hash
 * @returns The image hash as a hex string
 */
export async function generateImageHashFromBlob(imageBlob: Blob): Promise<string> {
  // Get the raw binary data as an ArrayBuffer
  const arrayBuffer = await imageBlob.arrayBuffer();

  // Compute the hash (e.g., SHA-256)
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

  // Convert the hash buffer to a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export function cleanUpImage(img: HTMLImageElement, canvas: HTMLCanvasElement, url?: string) {
  if (url) {
    URL.revokeObjectURL(url);
  }
  img.remove();
  canvas.remove();
}
