export interface HistogramBin {
  count: number;
  value: number;
}

export interface Histogram {
  r: HistogramBin[];
  g: HistogramBin[];
  b: HistogramBin[];
  totalPixels: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type Color = RGB;

export interface Brightness {
  averageBrightness: number;
  brightnessRange: {
    min: number;
    max: number;
  };
}

export interface VisualMetadata {
  averageColor: Color;
  dominantColors: Color[];
  representativePaletteColors: Color[];
  distinctPaletteColors: Color[];
  histogram: Histogram;
  brightness: Brightness;
  colorVariance: Color;
}
