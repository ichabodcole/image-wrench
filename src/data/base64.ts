/**
 * Extracts the actual base64 data from a data URL
 */
export function getBase64Data(base64Data: string): { mimeType: string; base64: string } {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64 data URL');
  const mimeType = matches[1];
  const base64 = matches[2];

  return { mimeType, base64 };
}
