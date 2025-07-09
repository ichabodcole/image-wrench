import type { Color, Histogram, HistogramBin, VisualMetadata } from '~/types/color';
import {
  rgbToHsl,
  calculatePixelBrightness,
  getPerceptualColorDifference,
  getColorScore,
  getWeightedBrightness,
  getWeightedHue,
} from './processing';

// Helper function to get average color or fallback to black
export function getAverageColor(imageMetadata: VisualMetadata): Color {
  return imageMetadata.averageColor || { r: 0, g: 0, b: 0 };
}

// Helper function to get the most dominant color or fallback to average
export function getDominantColor(imageMetadata: VisualMetadata): Color {
  return imageMetadata.dominantColors?.[0] || getAverageColor(imageMetadata);
}

// Helper function to get the most representative color or fallback to average
export function getRepresentativeColor(imageMetadata: VisualMetadata): Color {
  return imageMetadata.representativePaletteColors?.[0] || getAverageColor(imageMetadata);
}

// Helper function to get histogram or undefined
export function getHistogram(imageMetadata: VisualMetadata): Histogram | undefined {
  return imageMetadata.histogram;
}

export function compareByLuminance(a: VisualMetadata, b: VisualMetadata): number {
  if (!a.dominantColors || !b.dominantColors) {
    return 0;
  }

  const aBrightness = a.dominantColors
    ? getWeightedBrightness(a.dominantColors)
    : calculatePixelBrightness(getAverageColor(a).r, getAverageColor(a).g, getAverageColor(a).b);

  const bBrightness = b.dominantColors
    ? getWeightedBrightness(b.dominantColors)
    : calculatePixelBrightness(getAverageColor(b).r, getAverageColor(b).g, getAverageColor(b).b);

  return bBrightness - aBrightness; // Higher brightness first
}

export function compareByHue(a: VisualMetadata, b: VisualMetadata): number {
  if (!a.dominantColors || !b.dominantColors) {
    return 0;
  }

  const aHue = getWeightedHue(a.dominantColors || [getAverageColor(a)]);
  const bHue = getWeightedHue(b.dominantColors || [getAverageColor(b)]);

  // Handle grayscale images (put them at the end)
  if (aHue === -1 && bHue === -1) {
    // If both are grayscale, sort by brightness
    return compareByLuminance(a, b);
  }
  if (aHue === -1) return 1; // a is grayscale, move to end
  if (bHue === -1) return -1; // b is grayscale, move to end

  return aHue - bHue;
}

export function compareBySaturation(a: VisualMetadata, b: VisualMetadata): number {
  if (!a.dominantColors || !b.dominantColors) {
    return 0;
  }

  // Get all dominant colors or fall back to average color
  const aColors = a.dominantColors || [getAverageColor(a)];
  const bColors = b.dominantColors || [getAverageColor(b)];

  // Calculate weighted average saturation, with more weight to the dominant colors
  const getWeightedSaturation = (colors: Color[]) => {
    let totalWeight = 0;
    let weightedSum = 0;
    let isImageGrayscale = true;

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i]!;
      const weight = 1 / (i + 1); // More weight to dominant colors
      const hsl = rgbToHsl(color);

      // Check if the color is grayscale (very close RGB values)
      const maxDiff = Math.max(
        Math.abs(color.r - color.g),
        Math.abs(color.g - color.b),
        Math.abs(color.r - color.b)
      );
      const isColorGrayscale = maxDiff < 8;

      // If any significant color is not grayscale, the image is not grayscale
      if (!isColorGrayscale && weight > 0.2) {
        isImageGrayscale = false;
      }

      const effectiveSaturation = isColorGrayscale ? 0 : hsl.s;
      weightedSum += effectiveSaturation * weight;
      totalWeight += weight;
    }

    return {
      saturation: weightedSum / totalWeight,
      isGrayscale: isImageGrayscale,
    };
  };

  const aResult = getWeightedSaturation(aColors);
  const bResult = getWeightedSaturation(bColors);

  // If one image is grayscale and the other isn't, grayscale should be at the end
  if (aResult.isGrayscale && !bResult.isGrayscale) return 1;
  if (!aResult.isGrayscale && bResult.isGrayscale) return -1;

  // If both are grayscale, sort by luminance
  if (aResult.isGrayscale && bResult.isGrayscale) {
    return compareByLuminance(a, b);
  }

  // Otherwise sort by saturation (higher saturation first)
  return bResult.saturation - aResult.saturation;
}

export function compareByColorRange(a: VisualMetadata, b: VisualMetadata): number {
  const aHist = getHistogram(a);
  const bHist = getHistogram(b);

  // If histogram data is available, use it for more accurate range analysis
  if (aHist && bHist) {
    const getColorRangeScore = (hist: Histogram) => {
      // Find the darkest and brightest significant colors
      // We consider a bin significant if it contains more than 0.5% of pixels
      const significantThreshold = hist.totalPixels * 0.005;

      // For each channel, find the range between darkest and brightest significant colors
      const getChannelRange = (bins: HistogramBin[]) => {
        let darkest = 255;
        let brightest = 0;

        for (const bin of bins) {
          if (bin.count >= significantThreshold) {
            darkest = Math.min(darkest, bin.value);
            brightest = Math.max(brightest, bin.value);
          }
        }

        return brightest - darkest;
      };

      const rRange = getChannelRange(hist.r);
      const gRange = getChannelRange(hist.g);
      const bRange = getChannelRange(hist.b);

      // Weight the ranges based on human perception of brightness
      return rRange * 0.299 + gRange * 0.587 + bRange * 0.114;
    };

    return getColorRangeScore(bHist) - getColorRangeScore(aHist); // Higher range first
  }

  // Fall back to analyzing min/max colors in the palette
  const aColors = a.distinctPaletteColors || a.dominantColors || [getAverageColor(a)];
  const bColors = b.distinctPaletteColors || b.dominantColors || [getAverageColor(b)];

  const getPaletteRange = (colors: Color[]) => {
    if (colors.length <= 1) return 0;

    // Calculate the range in perceived brightness
    const brightnesses = colors.map(color => calculatePixelBrightness(color.r, color.g, color.b));

    const minBrightness = Math.min(...brightnesses);
    const maxBrightness = Math.max(...brightnesses);

    return maxBrightness - minBrightness;
  };

  return getPaletteRange(bColors) - getPaletteRange(aColors); // Higher range first
}

export function compareByDarkColors(a: VisualMetadata, b: VisualMetadata): number {
  const aHist = getHistogram(a);
  const bHist = getHistogram(b);

  // If histogram data is available, use it for more accurate dark color analysis
  if (aHist && bHist) {
    const getDarknessScore = (hist: Histogram) => {
      // Focus on the darkest quarter of the bins
      const darkBinCount = Math.floor(hist.r.length / 4);

      // Calculate weighted sum of dark bins across channels
      const rDark = hist.r
        .slice(0, darkBinCount)
        .reduce((sum, bin, i) => sum + bin.count * (1 - i / darkBinCount), 0);
      const gDark = hist.g
        .slice(0, darkBinCount)
        .reduce((sum, bin, i) => sum + bin.count * (1 - i / darkBinCount), 0);
      const bDark = hist.b
        .slice(0, darkBinCount)
        .reduce((sum, bin, i) => sum + bin.count * (1 - i / darkBinCount), 0);

      // Weight channels based on perceived brightness
      return (rDark * 0.299 + gDark * 0.587 + bDark * 0.114) / hist.totalPixels;
    };

    return getDarknessScore(bHist) - getDarknessScore(aHist); // More dark colors first
  }

  // Fall back to analyzing dominant colors
  const aColors = a.dominantColors || [getAverageColor(a)];
  const bColors = b.dominantColors || [getAverageColor(b)];

  const getDarknessFromColors = (colors: Color[]) => {
    return getColorScore(colors, {
      lightnessWeight: 2, // Emphasize darkness
      saturationWeight: 0.5, // Consider saturation less
      hueWeight: 0.5, // Consider hue less
    });
  };

  // Invert the scores since getColorScore returns higher values for lighter colors
  return 1 - getDarknessFromColors(bColors) - (1 - getDarknessFromColors(aColors));
}

export function compareByBrightColors(a: VisualMetadata, b: VisualMetadata): number {
  const aHist = getHistogram(a);
  const bHist = getHistogram(b);

  // If histogram data is available, use it for more accurate bright color analysis
  if (aHist && bHist) {
    const getBrightnessScore = (hist: Histogram) => {
      // Focus on the brightest quarter of the bins
      const brightBinStart = Math.floor((3 * hist.r.length) / 4);

      // Calculate weighted sum of bright bins across channels
      const rBright = hist.r
        .slice(brightBinStart)
        .reduce((sum, bin, i) => sum + bin.count * ((i + 1) / (hist.r.length - brightBinStart)), 0);
      const gBright = hist.g
        .slice(brightBinStart)
        .reduce((sum, bin, i) => sum + bin.count * ((i + 1) / (hist.g.length - brightBinStart)), 0);
      const bBright = hist.b
        .slice(brightBinStart)
        .reduce((sum, bin, i) => sum + bin.count * ((i + 1) / (hist.b.length - brightBinStart)), 0);

      // Weight channels based on perceived brightness
      return (rBright * 0.299 + gBright * 0.587 + bBright * 0.114) / hist.totalPixels;
    };

    return getBrightnessScore(bHist) - getBrightnessScore(aHist); // More bright colors first
  }

  // Fall back to analyzing dominant colors
  const aColors = a.dominantColors || [getAverageColor(a)];
  const bColors = b.dominantColors || [getAverageColor(b)];

  const getBrightnessFromColors = (colors: Color[]) => {
    return getColorScore(colors, {
      lightnessWeight: 2, // Emphasize brightness
      saturationWeight: 0.5, // Consider saturation less
      hueWeight: 0.5, // Consider hue less
    });
  };

  return getBrightnessFromColors(bColors) - getBrightnessFromColors(aColors);
}

export function compareByColorDiversity(a: VisualMetadata, b: VisualMetadata): number {
  const aColors = a.distinctPaletteColors || a.representativePaletteColors || [getAverageColor(a)];
  const bColors = b.distinctPaletteColors || b.representativePaletteColors || [getAverageColor(b)];

  // Calculate perceptual diversity using Lab color space
  const getDiversityScore = (colors: Color[]) => {
    if (colors.length <= 1) return 0;
    let totalDiff = 0;
    let count = 0;

    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        totalDiff += getPerceptualColorDifference(colors[i]!, colors[j]!);
        count++;
      }
    }

    return count > 0 ? totalDiff / count : 0;
  };

  return getDiversityScore(bColors) - getDiversityScore(aColors); // Higher diversity first
}

export function compareByColorTemperature(a: VisualMetadata, b: VisualMetadata): number {
  if (!a.dominantColors || !b.dominantColors) {
    return 0;
  }

  const getColorTemperature = (colors: Color[]) => {
    return (
      colors.reduce((sum, color, i) => {
        const weight = 1 / (i + 1);
        // Calculate warmth based on red and blue components
        // Red contributes to warmth, blue contributes to coolness
        const warmth = (color.r - color.b) / 255;
        return sum + warmth * weight;
      }, 0) / colors.reduce((sum, _, i) => sum + 1 / (i + 1), 0)
    );
  };

  const aColors = a.dominantColors || [getAverageColor(a)];
  const bColors = b.dominantColors || [getAverageColor(b)];

  return getColorTemperature(bColors) - getColorTemperature(aColors);
}
