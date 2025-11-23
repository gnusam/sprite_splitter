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
  status: 'pending' | 'naming' | 'ready' | 'error';
}

export enum ProcessingStep {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
}
