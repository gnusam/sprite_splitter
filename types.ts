export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Asset {
  id: string;
  originalName: string; // The suggested name by AI
  finalName: string; // The user edited name
  blob: Blob;
  previewUrl: string;
  box: BoundingBox;
  outputWidth: number;
  outputHeight: number;
  status: 'pending' | 'naming' | 'ready' | 'error';
}

export interface ProcessingSettings {
  removeBackground: boolean;
  backgroundTolerance: number; // 0-100
  targetSize: number; // e.g., 512 for 512x512
  padding: number; // percentage of targetSize (e.g., 10%)
  homogenize: boolean; // whether to force square size
}

export enum ProcessingStep {
  UPLOAD = 'UPLOAD',
  SETTINGS = 'SETTINGS',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
}