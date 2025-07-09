import { describe, it, expect } from 'vitest';
import { getAverageColor } from '../sorting';
import type { VisualMetadata, Color } from '~/types/color';

describe('getAverageColor', () => {
  it('returns the averageColor property from VisualMetadata', () => {
    const avgColor: Color = { r: 10, g: 20, b: 30 };
    const metadata: VisualMetadata = {
      averageColor: avgColor,
      dominantColors: [],
      representativePaletteColors: [],
      distinctPaletteColors: [],
      histogram: {
        r: [],
        g: [],
        b: [],
        totalPixels: 0,
      },
      brightness: {
        averageBrightness: 0,
        brightnessRange: { min: 0, max: 0 },
      },
      colorVariance: { r: 0, g: 0, b: 0 },
    };
    expect(getAverageColor(metadata)).toEqual(avgColor);
  });

  it('returns black if averageColor is missing', () => {
    const metadata = {
      averageColor: undefined,
      dominantColors: [],
      representativePaletteColors: [],
      distinctPaletteColors: [],
      histogram: {
        r: [],
        g: [],
        b: [],
        totalPixels: 0,
      },
      brightness: {
        averageBrightness: 0,
        brightnessRange: { min: 0, max: 0 },
      },
      colorVariance: { r: 0, g: 0, b: 0 },
    } as unknown as VisualMetadata;
    expect(getAverageColor(metadata)).toEqual({ r: 0, g: 0, b: 0 });
  });
});
