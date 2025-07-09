export interface PngChunk {
  length: number;
  type: string;
  data: Uint8Array;
  crc: number;
}

export interface PngMetadata {
  title: string;
  author: string;
  description: string;
  copyright: string;
  creationTime: string;
  software: string;
}

export interface GpsCoordinates {
  lat: number;
  lng: number;
}

export interface ExifMetadata {
  camera?: string;
  dateOriginal?: string;
  iso?: number;
  aperture?: string;
  exposureTime?: string;
  focalLength?: string;
  gpsCoordinates?: GpsCoordinates;
  description?: string;
  copyright?: string;
  artist?: string;
}

export interface ImageThumbnailDefinition {
  data: Blob;
  width: number;
  height: number;
}

export interface ImageMetadataDefinition {
  dateCreated: string;
  dateModified: string;
  mimeType: string;
  fileSize: number;
  originalWidth: number;
  originalHeight: number;
  exif: ExifMetadata;
  png: PngMetadata;
}
