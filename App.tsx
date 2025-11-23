import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { AssetCard } from './components/AssetCard';
import { Asset, BoundingBox, ProcessingStep } from './types';
import { findSprites, cropImage } from './utils/imageProcessor';
import { identifyAsset } from './services/geminiService';
import { ArrowLeft, Box, Download, Layers, Sparkles, Wand2 } from 'lucide-react';
import JSZip from 'jszip';

// Helper to download blob
const saveAs = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const App: React.FC = () => {
  const [step, setStep] = useState<ProcessingStep>(ProcessingStep.UPLOAD);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Stats
  const [processedCount, setProcessedCount] = useState(0);

  // Load Image
  const handleFileSelect = (file: File) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      setSourceImage(img);
      setStep(ProcessingStep.PROCESSING);
      URL.revokeObjectURL(objectUrl);
    };
  };

  // Automated Splitting Effect
  useEffect(() => {
    if (step === ProcessingStep.PROCESSING && sourceImage && canvasRef.current) {
      const process = async () => {
        try {
          // 1. Detect Boxes
          const boxes = findSprites(sourceImage, canvasRef.current!);
          
          // 2. Create Asset Objects
          const initialAssets: Asset[] = await Promise.all(boxes.map(async (box, index) => {
            const blob = await cropImage(canvasRef.current!, box);
            return {
              id: `asset-${index}-${Date.now()}`,
              originalName: '',
              finalName: `item_${index + 1}`,
              blob,
              previewUrl: URL.createObjectURL(blob),
              box,
              status: 'pending' as const
            };
          }));

          setAssets(initialAssets);
          setStep(ProcessingStep.REVIEW);
          
          // 3. Start Background AI Naming
          queueAiNaming(initialAssets);

        } catch (err) {
          console.error("Processing failed", err);
          alert("Failed to process image. See console for details.");
          setStep(ProcessingStep.UPLOAD);
        }
      };
      
      process();
    }
  }, [step, sourceImage]);

  // AI Queue Management
  const queueAiNaming = async (currentAssets: Asset[]) => {
    // Process sequentially or in small batches to avoid rate limits
    const BATCH_SIZE = 3;
    
    // We iterate through chunks
    for (let i = 0; i < currentAssets.length; i += BATCH_SIZE) {
      const batch = currentAssets.slice(i, i + BATCH_SIZE);
      
      const promises = batch.map(async (asset) => {
        // Update status to naming
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'naming' } : a));
        
        // Call Gemini
        const name = await identifyAsset(asset.blob);
        
        // Update result
        setAssets(prev => prev.map(a => {
           if (a.id === asset.id) {
             return {
               ...a,
               originalName: name,
               finalName: name,
               status: 'ready'
             };
           }
           return a;
        }));
        setProcessedCount(prev => prev + 1);
      });

      await Promise.all(promises);
      
      // Small delay between batches to be kind to the API
      await new Promise(r => setTimeout(r, 500)); 
    }
  };

  const handleRename = (id: string, newName: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, finalName: newName } : a));
  };

  const handleDownloadSingle = (asset: Asset) => {
    saveAs(asset.blob, `${asset.finalName}.png`);
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    assets.forEach(asset => {
      zip.file(`${asset.finalName}.png`, asset.blob);
    });
    
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "sprites_split.zip");
  };

  const handleReset = () => {
    setAssets([]);
    setSourceImage(null);
    setProcessedCount(0);
    setStep(ProcessingStep.UPLOAD);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Layers className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              SpriteSplit AI
            </h1>
          </div>
          
          {step === ProcessingStep.REVIEW && (
             <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">
                  AI Processed: <span className="text-white font-mono">{processedCount}/{assets.length}</span>
                </span>
                <button 
                  onClick={handleDownloadAll}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full font-medium transition-colors text-sm"
                >
                  <Download size={16} />
                  Download ZIP
                </button>
             </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-6">
        <div className="max-w-7xl mx-auto">
          
          {step === ProcessingStep.UPLOAD && (
            <div className="max-w-2xl mx-auto mt-20">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-white mb-4">
                  Turn Sprite Sheets into <br/>
                  <span className="text-blue-400">Named Assets instantly</span>
                </h2>
                <p className="text-gray-400 text-lg">
                  Upload a grid or sprite sheet. We'll split it and use Gemini AI to recognize and name every item.
                </p>
              </div>
              <Dropzone onFileSelect={handleFileSelect} />
            </div>
          )}

          {step === ProcessingStep.PROCESSING && (
             <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
               <div className="relative">
                 <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full"></div>
                 <Wand2 className="w-16 h-16 text-blue-400 animate-pulse relative z-10" />
               </div>
               <h3 className="text-2xl font-semibold">Analyzing Image Topology...</h3>
               <p className="text-gray-400">Detecting transparent regions and isolating sprites.</p>
             </div>
          )}

          {step === ProcessingStep.REVIEW && (
            <div className="space-y-8">
              {/* Toolbar */}
              <div className="flex items-center gap-4">
                 <button 
                   onClick={handleReset}
                   className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                 >
                   <ArrowLeft size={18} />
                   Start Over
                 </button>
                 <div className="h-4 w-px bg-gray-700"></div>
                 <h2 className="text-xl font-semibold">Found {assets.length} Assets</h2>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                 {assets.map(asset => (
                   <AssetCard 
                     key={asset.id} 
                     asset={asset} 
                     onRename={handleRename}
                     onDownload={handleDownloadSingle}
                   />
                 ))}
              </div>
              
              {assets.length === 0 && (
                <div className="text-center py-20 bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-700">
                   <Box className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                   <p className="text-gray-400">No sprites detected. Try an image with clear transparent backgrounds.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p className="flex items-center justify-center gap-2">
            Powered by <Sparkles size={14} className="text-blue-400" /> Google Gemini 2.5 Flash
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
