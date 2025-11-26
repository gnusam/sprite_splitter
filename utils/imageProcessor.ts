import { BoundingBox, ProcessingSettings } from '../types';

/**
 * Removes the background color based on the top-left pixel.
 */
export const removeBackground = (
  canvas: HTMLCanvasElement, 
  tolerance: number = 20
): void => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Get background color from top-left pixel
  const r0 = data[0];
  const g0 = data[1];
  const b0 = data[2];
  const a0 = data[3];

  // If top-left is already transparent, assume it's good
  if (a0 === 0) return;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate Euclidean distance
    const distance = Math.sqrt(
      Math.pow(r - r0, 2) + Math.pow(g - g0, 2) + Math.pow(b - b0, 2)
    );

    if (distance <= tolerance) {
      data[i + 3] = 0; // Set alpha to 0
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

// Helper to check intersection between two boxes
const doBoxesIntersect = (a: BoundingBox, b: BoundingBox) => {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
};

// Merges boxes that overlap into larger single boxes
const mergeOverlappingBoxes = (boxes: BoundingBox[]): BoundingBox[] => {
  let result = [...boxes];
  let changed = true;
  
  // Keep merging until no more intersections are found
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (doBoxesIntersect(result[i], result[j])) {
          // Merge j into i
          const b1 = result[i];
          const b2 = result[j];
          
          const minX = Math.min(b1.x, b2.x);
          const minY = Math.min(b1.y, b2.y);
          const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
          const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);
          
          result[i] = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
          };
          
          // Remove box j
          result.splice(j, 1);
          changed = true;
          break; // Restart loop
        }
      }
      if (changed) break;
    }
  }
  return result;
};

/**
 * analyzes an image and finds bounding boxes for distinct non-transparent objects.
 * Uses a basic Connected Component Labeling approach (Flood Fill) and then merges overlapping boxes.
 */
export const findSprites = (
  canvas: HTMLCanvasElement
): BoundingBox[] => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Matrix to keep track of visited pixels
  const visited = new Int8Array(width * height); // 0 = unvisited, 1 = visited
  const boxes: BoundingBox[] = [];

  const getIndex = (x: number, y: number) => (y * width + x) * 4;
  const isTransparent = (idx: number) => data[idx + 3] < 10; // Alpha threshold

  // Stack-based flood fill to avoid recursion limits
  const floodFill = (startX: number, startY: number): BoundingBox | null => {
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    const stack = [[startX, startY]];
    visited[startY * width + startX] = 1;
    
    let pixelCount = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      pixelCount++;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // Check 4 neighbors
      const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const vIdx = ny * width + nx;
          if (visited[vIdx] === 0) {
            const pIdx = getIndex(nx, ny);
            if (!isTransparent(pIdx)) {
              visited[vIdx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }
    }

    // Filter out tiny noise (e.g., stray pixels)
    if (pixelCount < 50) return null; 

    // Add minimal padding for detection box
    const detectionPadding = 1;
    return {
      x: Math.max(0, minX - detectionPadding),
      y: Math.max(0, minY - detectionPadding),
      width: Math.min(width, maxX - minX + 1 + (detectionPadding * 2)),
      height: Math.min(height, maxY - minY + 1 + (detectionPadding * 2)),
    };
  };

  // Scan the image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] === 0) {
        const pixelIdx = getIndex(x, y);
        if (!isTransparent(pixelIdx)) {
          // Found a new object
          const box = floodFill(x, y);
          if (box) {
            boxes.push(box);
          }
        }
      }
    }
  }

  // Post-processing: Merge overlapping bounding boxes
  // This helps when an object is composed of detached parts (like floating bits) 
  // or when complex shapes interlock.
  return mergeOverlappingBoxes(boxes);
};

export const cropImage = (
  sourceCanvas: HTMLCanvasElement,
  box: BoundingBox,
  settings: ProcessingSettings
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('No context'));
      return;
    }

    if (settings.homogenize) {
      // Create a square canvas
      tempCanvas.width = settings.targetSize;
      tempCanvas.height = settings.targetSize;

      // Calculate available space inside padding
      const paddingPx = Math.round(settings.targetSize * (settings.padding / 100));
      const availableWidth = settings.targetSize - (paddingPx * 2);
      const availableHeight = settings.targetSize - (paddingPx * 2);

      // Calculate scale to fit preserving aspect ratio
      const scale = Math.min(
        availableWidth / box.width,
        availableHeight / box.height
      );

      const drawWidth = box.width * scale;
      const drawHeight = box.height * scale;

      // Center it
      const startX = paddingPx + (availableWidth - drawWidth) / 2;
      const startY = paddingPx + (availableHeight - drawHeight) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(
        sourceCanvas,
        box.x,
        box.y,
        box.width,
        box.height,
        startX,
        startY,
        drawWidth,
        drawHeight
      );

    } else {
      // Just crop exactly as is, maybe with a small uniform padding
      const margin = 2;
      tempCanvas.width = box.width + (margin * 2);
      tempCanvas.height = box.height + (margin * 2);
      
      ctx.drawImage(
        sourceCanvas,
        box.x,
        box.y,
        box.width,
        box.height,
        margin,
        margin,
        box.width,
        box.height
      );
    }

    tempCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Crop failed'));
    }, 'image/png');
  });
};