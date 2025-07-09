import { getBase64Data } from '@/data/base64';

/**
 * Loads an image from a URL or base64 data
 * @param source The image source (URL or base64 data)
 */
export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
}

export function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function convertBase64ToBlob(base64Data: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // Extract the mime type and the actual base64 data
      const { mimeType, base64 } = getBase64Data(base64Data);

      // Decode base64 to binary string
      const byteString = atob(base64);
      // Create an array buffer
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }
      // Create a Blob from the array buffer
      const blob = new Blob([arrayBuffer], { type: mimeType });
      resolve(blob);
    } catch (error) {
      reject(error);
    }
  });
}
