import { Logger } from '~/services/logger';
import type { Color, HistogramBin, Histogram, Brightness, VisualMetadata } from '~/types/color';
import { DOMINANT_COLORS_COUNT, PALETTE_COLORS_COUNT } from '~/constants/color';

const logger = Logger.getLogger('ColorProcessing');

const HISTOGRAM_BINS = 32; // Number of bins for each color channel
const CANDIDATE_SIZE_FACTOR = 12; // Factor to increase candidate size for distinct palette
/**
 * Analyzes the visual characteristics of an image from canvas data
 * @param canvas The canvas element containing the image
 * @returns Visual metadata including histogram, dominant colors, and brightness
 */
export function analyzeImageColors(canvas: HTMLCanvasElement | OffscreenCanvas): VisualMetadata {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Failed to get canvas context');

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Initialize data structures
  const histogram = initializeHistogram();
  const colorCounts = new Map<string, number>();
  let totalR = 0,
    totalG = 0,
    totalB = 0;
  let minBrightness = 1,
    maxBrightness = 0,
    totalBrightness = 0;

  // Process each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    // Get RGB values - we know these exist because we're iterating in steps of 4
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    if (r === undefined || g === undefined || b === undefined) {
      logger.warn('Unexpected undefined pixel value at index:', i);
      continue;
    }

    // Update histogram
    updateHistogram(histogram, r, g, b);

    // Track color frequencies for dominant color calculation
    const colorKey = `${r},${g},${b}`;
    colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);

    // Update totals for average color
    totalR += r;
    totalG += g;
    totalB += b;

    // Calculate pixel brightness (using relative luminance formula)
    const brightness = calculatePixelBrightness(r, g, b);
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
    totalBrightness += brightness;
  }

  const totalPixels = pixels.length / 4;
  histogram.totalPixels = totalPixels;

  // Calculate average color
  const averageColor: Color = {
    r: Math.round(totalR / totalPixels),
    g: Math.round(totalG / totalPixels),
    b: Math.round(totalB / totalPixels),
  };

  // Extract dominant colors
  const dominantColors = extractDominantColors(colorCounts, DOMINANT_COLORS_COUNT);

  // Extract representative palette colors
  const representativePaletteColors = extractColorPalette(canvas, PALETTE_COLORS_COUNT);

  // Extract distinct palette colors
  const distinctPaletteColors = extractDistinctColorPalette(
    canvas,
    PALETTE_COLORS_COUNT,
    CANDIDATE_SIZE_FACTOR
  );
  // Calculate brightness metrics
  const brightness: Brightness = {
    averageBrightness: totalBrightness / totalPixels,
    brightnessRange: {
      min: minBrightness,
      max: maxBrightness,
    },
  };

  const colorVariance: Color = calculateColorVariance(canvas);

  logger.debug('Image color analysis complete:', {
    averageColor,
    dominantColorsCount: dominantColors.length,
    brightness,
    histogramBins: HISTOGRAM_BINS,
    colorVariance,
  });

  return {
    averageColor,
    dominantColors,
    representativePaletteColors,
    distinctPaletteColors,
    histogram,
    brightness,
    colorVariance,
  };
}

function initializeHistogram(): Histogram {
  const createBins = (): HistogramBin[] =>
    Array.from({ length: HISTOGRAM_BINS }, (_, i) => ({
      count: 0,
      value: Math.floor((i * 256) / HISTOGRAM_BINS),
    }));

  return {
    r: createBins(),
    g: createBins(),
    b: createBins(),
    totalPixels: 0,
  };
}

function updateHistogram(histogram: Histogram, r: number, g: number, b: number): void {
  const getBinIndex = (value: number) => Math.floor((value * HISTOGRAM_BINS) / 256);

  const rBin = histogram.r[getBinIndex(r)];
  const gBin = histogram.g[getBinIndex(g)];
  const bBin = histogram.b[getBinIndex(b)];

  if (rBin && gBin && bBin) {
    rBin.count++;
    gBin.count++;
    bBin.count++;
  } else {
    logger.warn('Invalid histogram bin index:', { r, g, b });
  }
}

export function calculatePixelBrightness(r: number, g: number, b: number): number {
  // Using relative luminance formula (perceived brightness)
  // https://www.w3.org/TR/WCAG20/#relativeluminancedef
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;

  const rL = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
  const gL = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
  const bL = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);

  return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
}

interface DataPoint {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface Centroid {
  r: number;
  g: number;
  b: number;
}

// Compute Euclidean distance squared between two colors.
function euclideanDistanceSquared(c1: Centroid, c2: Centroid): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
}

// Initialize centroids using a weighted k-means++ strategy.
function initializeCentroidsKMeansPP(data: DataPoint[], k: number): Centroid[] {
  const centroids: Centroid[] = [];

  // Choose the first centroid randomly weighted by count.
  const totalWeight = data.reduce((sum, d) => sum + d.count, 0);
  let randomWeight = Math.random() * totalWeight;
  let firstCentroid: DataPoint | undefined;
  for (const d of data) {
    randomWeight -= d.count;
    if (randomWeight <= 0) {
      firstCentroid = d;
      break;
    }
  }
  if (!firstCentroid) {
    firstCentroid = data[data.length - 1];
  }
  centroids.push({ r: firstCentroid!.r, g: firstCentroid!.g, b: firstCentroid!.b });

  // Choose the remaining centroids weighted by the squared distance
  // from the nearest already chosen centroid.
  while (centroids.length < k) {
    const distances: number[] = data.map(d => {
      const minDist = Math.min(...centroids.map(c => euclideanDistanceSquared(d, c)));
      return minDist * d.count; // weight by the frequency of the color
    });
    const sumDistances = distances.reduce((acc, val) => acc + val, 0);
    let rand = Math.random() * sumDistances;
    let selected: DataPoint | undefined;
    for (let i = 0; i < data.length; i++) {
      rand -= distances[i]!;
      if (rand <= 0) {
        selected = data[i];
        break;
      }
    }
    if (!selected) {
      selected = data[data.length - 1];
    }
    centroids.push({ r: selected!.r, g: selected!.g, b: selected!.b });
  }

  return centroids;
}

// Cluster the data points using weighted k-means.
function kMeansClustering(
  data: DataPoint[],
  centroids: Centroid[],
  maxIterations: number = 10
): { centroids: Centroid[]; clusterWeights: number[] } {
  const k = centroids.length;
  // Create an array of sums with an explicit type so indexes are defined.
  const sums: { sumR: number; sumG: number; sumB: number; weight: number }[] = Array.from(
    { length: k },
    () => ({ sumR: 0, sumG: 0, sumB: 0, weight: 0 })
  );

  // Initialize clusterWeights explicitly.
  const clusterWeights: number[] = new Array<number>(k).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Reset sums for each iteration.
    for (let i = 0; i < k; i++) {
      sums[i] = { sumR: 0, sumG: 0, sumB: 0, weight: 0 };
    }

    // Assign each data point to its nearest centroid.
    for (const d of data) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < k; i++) {
        const d2 = euclideanDistanceSquared(d, centroids[i]!);
        if (d2 < bestDistance) {
          bestDistance = d2;
          bestIndex = i;
        }
      }
      sums[bestIndex]!.sumR += d.r * d.count;
      sums[bestIndex]!.sumG += d.g * d.count;
      sums[bestIndex]!.sumB += d.b * d.count;
      sums[bestIndex]!.weight += d.count;
    }

    // Update centroids using weighted averages.
    let converged = true;
    for (let i = 0; i < k; i++) {
      if (sums[i]!.weight > 0) {
        const newCentroid = {
          r: sums[i]!.sumR / sums[i]!.weight,
          g: sums[i]!.sumG / sums[i]!.weight,
          b: sums[i]!.sumB / sums[i]!.weight,
        };
        // If the centroid moved significantly, mark as not converged.
        if (euclideanDistanceSquared(centroids[i]!, newCentroid) > 1.0) {
          converged = false;
        }
        centroids[i] = newCentroid;
        clusterWeights[i] = sums[i]!.weight;
      } else {
        // If no points are assigned, reinitialize this centroid randomly.
        centroids[i] = data[Math.floor(Math.random() * data.length)]!;
        clusterWeights[i] = 0;
        converged = false;
      }
    }

    if (converged) break;
  }

  return { centroids, clusterWeights };
}

// Helper function to convert RGB to HSL
export function rgbToHsl(color: Color): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

// Helper function to sort colors by HSL values
export function sortColorsByHsl(colors: Color[]): Color[] {
  return [...colors].sort((a, b) => {
    const hslA = rgbToHsl(a);
    const hslB = rgbToHsl(b);

    // First sort by hue
    if (hslA.h !== hslB.h) return hslA.h - hslB.h;
    // Then by saturation
    if (hslA.s !== hslB.s) return hslB.s - hslA.s;
    // Finally by lightness
    return hslB.l - hslA.l;
  });
}

// Updated dominant color extraction using k-means clustering.
export function extractDominantColors(colorCounts: Map<string, number>, k: number): Color[] {
  // Convert the color map into an array of weighted data points.
  const data: DataPoint[] = Array.from(colorCounts.entries())
    .map(([key, count]) => {
      const parts = key.split(',').map(part => parseInt(part, 10));
      if (parts.length !== 3 || parts.some(isNaN)) {
        logger.warn('Invalid color key format:', { key });
        return null;
      }
      return { r: parts[0], g: parts[1], b: parts[2], count };
    })
    .filter((d): d is DataPoint => d !== null);

  if (data.length === 0) return [];

  // If there are fewer unique colors than requested clusters, return them directly.
  if (data.length <= k) {
    return data.map(d => ({ r: d.r, g: d.g, b: d.b }));
  }

  // Initialize centroids using k-means++.
  const centroids = initializeCentroidsKMeansPP(data, k);
  // Run the k-means clustering algorithm.
  const { centroids: finalCentroids, clusterWeights } = kMeansClustering(data, centroids, 10);

  // Pair centroids with their associated weights.
  const clusters = finalCentroids.map((centroid, i) => ({
    centroid,
    weight: clusterWeights[i],
  }));

  // Sort clusters by weight descending to present the most dominant clusters first.
  clusters.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  // Convert the centroids into Color objects and apply consistent sorting
  const colors = clusters.map(c => ({
    r: Math.min(255, Math.max(0, Math.round(c.centroid.r))),
    g: Math.min(255, Math.max(0, Math.round(c.centroid.g))),
    b: Math.min(255, Math.max(0, Math.round(c.centroid.b))),
  }));

  return colors;
}

/**
 * Represents a box in RGB color space containing a subset of DataPoint values.
 */
interface ColorBox {
  data: DataPoint[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

/**
 * Creates a ColorBox that bounds the given data points.
 */
function createColorBox(data: DataPoint[]): ColorBox {
  let rMin = Infinity,
    rMax = -Infinity,
    gMin = Infinity,
    gMax = -Infinity,
    bMin = Infinity,
    bMax = -Infinity;

  for (const p of data) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }

  return { data, rMin, rMax, gMin, gMax, bMin, bMax };
}

/**
 * Splits a given ColorBox along its longest dimension into two boxes.
 */
export function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;

  let channel: 'r' | 'g' | 'b' = 'r';
  if (gRange >= rRange && gRange >= bRange) {
    channel = 'g';
  } else if (bRange >= rRange && bRange >= gRange) {
    channel = 'b';
  }

  // Sort the box's data by the selected channel.
  const sortedData = box.data.slice().sort((a, b) => a[channel] - b[channel]);

  // Determine the weighted median index.
  const totalCount = sortedData.reduce((sum, p) => sum + p.count, 0);
  let cumulative = 0;
  let medianIndex = 0;

  for (let i = 0; i < sortedData.length; i++) {
    cumulative += sortedData[i]!.count;
    if (cumulative >= totalCount / 2) {
      medianIndex = i;
      break;
    }
  }

  // Ensure that neither split is empty.
  if (medianIndex === 0) {
    medianIndex = 1;
  }

  const leftData = sortedData.slice(0, medianIndex);
  const rightData = sortedData.slice(medianIndex);

  return [createColorBox(leftData), createColorBox(rightData)];
}

/**
 * Computes the weighted average color from a set of DataPoints.
 */
export function computeAverageColor(data: DataPoint[]): Color {
  let sumR = 0,
    sumG = 0,
    sumB = 0,
    total = 0;

  for (const p of data) {
    sumR += p.r * p.count;
    sumG += p.g * p.count;
    sumB += p.b * p.count;
    total += p.count;
  }

  return {
    r: Math.round(sumR / total),
    g: Math.round(sumG / total),
    b: Math.round(sumB / total),
  };
}

/**
 * Uses the median cut algorithm to quantize the provided color data into a palette of the specified size.
 * @param data Array of DataPoint representing colors and their frequencies.
 * @param paletteSize The number of colors desired in the palette.
 * @returns An array of Color objects representing the extracted palette.
 */
export function medianCutQuantize(data: DataPoint[], paletteSize: number): Color[] {
  if (data.length === 0) {
    return [];
  }

  // Start with one box that encompasses all the data.
  const boxes: ColorBox[] = [createColorBox(data)];

  // Iteratively split the box with the largest range until we have enough boxes.
  while (boxes.length < paletteSize) {
    let boxToSplitIndex = -1;
    let maxRange = -Infinity;

    for (let i = 0; i < boxes.length; i++) {
      const box: ColorBox = boxes[i] as ColorBox;
      const range = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin);
      if (range > maxRange) {
        maxRange = range;
        boxToSplitIndex = i;
      }
    }

    // If no box has been selected, break.
    if (boxToSplitIndex === -1) break;

    const boxToSplit = boxes[boxToSplitIndex]!;
    if (boxToSplit.data.length <= 1) break; // Cannot split further if only one color.

    const [box1, box2] = splitBox(boxToSplit);
    boxes.splice(boxToSplitIndex, 1, box1, box2);
  }

  // For each box, compute the average color.
  return boxes.map(box => computeAverageColor(box.data));
}

// Helper function to compute saturation. Returns a value between 0 and 1.
function getSaturation(color: { r: number; g: number; b: number }): number {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Extracts a color palette from the image contained in the provided canvas element.
 *
 * This method computes unique colors from the image, then applies a median cut algorithm to extract
 * a diverse palette of the given size. To help capture accent colors—which may be visually strong
 * in spite of low frequency—we boost the effective weight of colors based on their saturation.
 *
 * @param canvas The canvas element containing the image.
 * @param paletteSize The number of colors to include in the palette.
 * @returns An array of Color objects representing the extracted palette.
 */
export function extractColorPalette(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  paletteSize: number
): Color[] {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Failed to get canvas context');

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Build a map of unique colors to their frequency.
  const colorCounts = new Map<string, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = `${r},${g},${b}`;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  }

  // Optionally boost frequency for high-saturation (accent) colors.
  // Increase this factor to give more weight to colors that are more saturated.
  const saturationFactor = 1;

  // Convert the map into an array of DataPoint values.
  const data: DataPoint[] = Array.from(colorCounts.entries())
    .map(([key, count]) => {
      const parts = key.split(',').map(str => parseInt(str, 10));
      const [r, g, b] = parts;
      if (
        r === undefined ||
        g === undefined ||
        b === undefined ||
        isNaN(r) ||
        isNaN(g) ||
        isNaN(b)
      ) {
        logger.warn('Invalid color key format:', { key });
        return null;
      }
      // Compute saturation for this color.
      const saturation = getSaturation({ r, g, b });
      // Increase the weight for more saturated colors.
      const effectiveCount = count * (1 + saturationFactor * saturation);
      return { r, g, b, count: effectiveCount };
    })
    .filter((d): d is DataPoint => d !== null);

  if (data.length === 0) {
    return [];
  }

  // Use the median cut algorithm to generate the color palette and apply consistent sorting
  const colors = medianCutQuantize(data, paletteSize);
  return colors;
}

// Helper function to compute Euclidean distance between two colors.
function colorDistance(c1: Color, c2: Color): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Extracts a distinct color palette from the image contained in the provided canvas element.
 *
 * This method first generates a candidate palette from the image using the median cut algorithm
 * (with an expanded candidate set) and then selects a subset of colors that are maximally distinct
 * from each other.
 *
 * @param canvas The canvas element containing the image.
 * @param distinctCount The desired number of distinct colors.
 * @param candidateSizeFactor Optional factor to enlarge the candidate palette compared to distinctCount. Defaults to 2.
 * @returns An array of Color objects representing the most distinct colors in the image.
 */
export function extractDistinctColorPalette(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  distinctCount: number,
  candidateSizeFactor: number = 2
): Color[] {
  // First, generate a larger candidate palette using median cut.
  const candidateCount = distinctCount * candidateSizeFactor;
  const candidatePalette = extractColorPalette(canvas, candidateCount);

  // If the candidate palette has fewer colors than desired already, return it.
  if (candidatePalette.length <= distinctCount) {
    return candidatePalette;
  }

  // Sort candidates by saturation (highest saturation first) as a proxy for visual strength.
  const sortedCandidates: Color[] = candidatePalette
    .slice()
    .sort((a, b) => getSaturation(b) - getSaturation(a));

  // Initialize the selected set with the candidate with the highest saturation.
  const selected: Color[] = [sortedCandidates.shift()!];

  // Greedily add the candidate that is furthest (in color distance) from the already selected colors.
  while (selected.length < distinctCount && sortedCandidates.length > 0) {
    let candidateIndex = -1;
    let maxMinDistance = -Infinity;

    for (let i = 0; i < sortedCandidates.length; i++) {
      // Assert the candidate is defined.
      const candidate = sortedCandidates[i]!;
      let minDistance = Infinity;
      for (const sel of selected) {
        const distance = colorDistance(candidate, sel);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
      // If this candidate is more distinct than any we've seen so far, record its index.
      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        candidateIndex = i;
      }
    }

    if (candidateIndex !== -1) {
      // Use non-null assertion on the spliced element.
      selected.push(sortedCandidates.splice(candidateIndex, 1)[0]!);
    } else {
      break;
    }
  }

  // Return the selected colors with consistent sorting
  return selected;
}

/**
 * Calculates the variance of each color channel in an image using a block-based approach
 * @param canvas The canvas element containing the image
 * @returns Object containing variance for each RGB channel, weighted by area coverage
 */
export function calculateColorVariance(canvas: HTMLCanvasElement | OffscreenCanvas): {
  r: number;
  g: number;
  b: number;
} {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Failed to get canvas context');

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Split image into 16x16 blocks
  const BLOCK_SIZE = 16;
  const blocksX = Math.ceil(canvas.width / BLOCK_SIZE);
  const blocksY = Math.ceil(canvas.height / BLOCK_SIZE);
  const blockVariances: Array<{ r: number; g: number; b: number }> = [];

  // Calculate variance for each block
  for (let blockY = 0; blockY < blocksY; blockY++) {
    for (let blockX = 0; blockX < blocksX; blockX++) {
      const startX = blockX * BLOCK_SIZE;
      const startY = blockY * BLOCK_SIZE;
      const endX = Math.min(startX + BLOCK_SIZE, canvas.width);
      const endY = Math.min(startY + BLOCK_SIZE, canvas.height);

      let totalR = 0,
        totalG = 0,
        totalB = 0;
      let pixelCount = 0;

      // First pass: calculate mean for this block
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          if (!r || !g || !b) continue;

          totalR += r;
          totalG += g;
          totalB += b;
          pixelCount++;
        }
      }

      if (pixelCount === 0) continue;

      const meanR = totalR / pixelCount;
      const meanG = totalG / pixelCount;
      const meanB = totalB / pixelCount;

      let varR = 0,
        varG = 0,
        varB = 0;

      // Second pass: calculate variance for this block
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          if (!r || !g || !b) continue;

          const diffR = r - meanR;
          const diffG = g - meanG;
          const diffB = b - meanB;

          varR += diffR * diffR;
          varG += diffG * diffG;
          varB += diffB * diffB;
        }
      }

      blockVariances.push({
        r: varR / pixelCount,
        g: varG / pixelCount,
        b: varB / pixelCount,
      });
    }
  }

  // Sort variances and take the 75th percentile to bias towards low variance
  const sortedR = blockVariances.map(v => v.r).sort((a, b) => a - b);
  const sortedG = blockVariances.map(v => v.g).sort((a, b) => a - b);
  const sortedB = blockVariances.map(v => v.b).sort((a, b) => a - b);

  const percentileIndex = Math.floor(blockVariances.length * 0.75);

  return {
    r: sortedR[percentileIndex] || 0,
    g: sortedG[percentileIndex] || 0,
    b: sortedB[percentileIndex] || 0,
  };
}

// Helper function to get weighted hue value
export function getWeightedHue(colors: Color[]): number {
  if (colors.length === 0) {
    return -1; // Special value for no colors
  }

  let totalWeight = 0;
  let weightedHue = 0;
  let hasColorfulPixels = false;

  // Calculate weighted average of hues, skipping grayscale colors
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]!;
    if (!isGrayscale(color)) {
      const weight = 1 / (i + 1); // More weight to more dominant colors
      const hsl = rgbToHsl(color);
      // Also weight by saturation - more saturated colors have more influence
      const effectiveWeight = weight * hsl.s;
      weightedHue += hsl.h * effectiveWeight;
      totalWeight += effectiveWeight;
      hasColorfulPixels = true;
    }
  }

  // If no colorful pixels found, this is effectively a grayscale image
  if (!hasColorfulPixels || totalWeight === 0) return -1;

  return weightedHue / totalWeight;
}

// Calculate perceptual color difference using a simplified Delta E
export function getPerceptualColorDifference(c1: Color, c2: Color): number {
  const lab1 = rgbToLab(c1);
  const lab2 = rgbToLab(c2);

  const dL = lab1.l - lab2.l;
  const dA = lab1.a - lab2.a;
  const dB = lab1.b - lab2.b;

  // Weight the differences based on human perception
  const wL = 1.0; // Lightness weight
  const wC = 1.2; // Chroma weight
  const wH = 0.8; // Hue weight

  return Math.sqrt(
    wL * dL * dL + // Lightness difference
      wC * (dA * dA + dB * dB) + // Chroma difference
      wH * Math.abs(dA * dB) // Hue difference approximation
  );
}

// Convert RGB to Lab color space for perceptual color differences
export function rgbToLab(color: Color): { l: number; a: number; b: number } {
  // First convert to XYZ
  let r = color.r / 255;
  let g = color.g / 255;
  let b = color.b / 255;

  // Convert to sRGB
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Convert to XYZ
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100;

  // Convert XYZ to Lab
  const xn = 95.047;
  const yn = 100.0;
  const zn = 108.883;

  const fx = x / xn > 0.008856 ? Math.pow(x / xn, 1 / 3) : (7.787 * x) / xn + 16 / 116;
  const fy = y / yn > 0.008856 ? Math.pow(y / yn, 1 / 3) : (7.787 * y) / yn + 16 / 116;
  const fz = z / zn > 0.008856 ? Math.pow(z / zn, 1 / 3) : (7.787 * z) / zn + 16 / 116;

  return {
    l: 116 * fy - 16, // L*
    a: 500 * (fx - fy), // a*
    b: 200 * (fy - fz), // b*
  };
}

// Helper function to determine if a color is effectively grayscale
export function isGrayscale(color: Color, threshold: number = 0.05): boolean {
  return (
    Math.abs(color.r - color.g) < threshold * 255 &&
    Math.abs(color.g - color.b) < threshold * 255 &&
    Math.abs(color.r - color.b) < threshold * 255
  );
}

// Get channel statistics for enhanced spread calculation
export function getChannelStats(values: number[]): {
  range: number;
  variance: number;
  mean: number;
} {
  if (values.length === 0) {
    return { range: 0, variance: 0, mean: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  return {
    range: max - min,
    variance,
    mean,
  };
}

// Get combined color score considering multiple metrics
export function getColorScore(
  colors: Color[],
  options: {
    saturationWeight?: number;
    lightnessWeight?: number;
    hueWeight?: number;
  } = {}
): number {
  if (colors.length === 0) return 0;

  const { saturationWeight = 1, lightnessWeight = 1, hueWeight = 1 } = options;

  const hslColors = colors.map(c => rgbToHsl(c));

  // Calculate weighted averages with exponential decay
  const saturationScore = getWeightedAverage(hslColors.map(c => c.s)) * saturationWeight;
  const lightnessScore = getWeightedAverage(hslColors.map(c => c.l)) * lightnessWeight;

  // For hue, we need to handle the circular nature of hue values
  const hueScore = (() => {
    const hues = hslColors.map(c => c.h);
    // Convert hues to cartesian coordinates to handle wraparound
    const x = getWeightedAverage(hues.map(h => Math.cos(h * 2 * Math.PI)));
    const y = getWeightedAverage(hues.map(h => Math.sin(h * 2 * Math.PI)));
    return ((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * hueWeight;
  })();

  return (
    (saturationScore + lightnessScore + hueScore) / (saturationWeight + lightnessWeight + hueWeight)
  );
}

// Calculate weighted average with exponential decay weights
export function getWeightedAverage(values: number[], decayFactor = 1): number {
  if (values.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  values.forEach((value, index) => {
    const weight = Math.exp(-index * decayFactor);
    weightedSum += value * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

// Helper function to calculate weighted brightness from a color array
export function getWeightedBrightness(colors: Color[] | undefined): number {
  if (!colors || colors.length === 0) return 0;

  // Weight earlier colors more heavily (they are more prominent)
  return (
    colors.reduce((sum, color, index) => {
      const weight = 1 / (index + 1); // 1, 1/2, 1/3, etc.
      return sum + calculatePixelBrightness(color.r, color.g, color.b) * weight;
    }, 0) / colors.reduce((sum, _, index) => sum + 1 / (index + 1), 0)
  ); // Normalize by weight sum
}
