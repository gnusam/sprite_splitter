import { BoundingBox } from '../types';

/**
 * analyzes an image and finds bounding boxes for distinct non-transparent objects.
 * Uses a basic Connected Component Labeling approach (Flood Fill).
 */
export const findSprites = (
  img: HTMLImageElement,
  canvas: HTMLCanvasElement
): BoundingBox[] => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

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

    // Add padding
    const padding = 2;
    return {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(width, maxX - minX + 1 + (padding * 2)),
      height: Math.min(height, maxY - minY + 1 + (padding * 2)),
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

  return boxes;
};

export const cropImage = (
  sourceCanvas: HTMLCanvasElement,
  box: BoundingBox
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = box.width;
    tempCanvas.height = box.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      reject(new Error('No context'));
      return;
    }

    ctx.drawImage(
      sourceCanvas,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      box.width,
      box.height
    );

    tempCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Crop failed'));
    }, 'image/png');
  });
};
