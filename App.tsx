import React, { useState, useRef, useEffect } from 'react';
import { Dropzone } from './components/Dropzone';
import { AssetCard } from './components/AssetCard';
import { Asset, ProcessingStep, ProcessingSettings } from './types';
import { findSprites, cropImage, removeBackground } from './utils/imageProcessor';
import { identifyAsset } from './services/geminiService';
import { ArrowLeft, Box, Download, Layers, Sparkles, Wand2, Settings2, Play, AlertTriangle } from 'lucide-react';
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Settings State
  const [settings, setSettings] = useState<ProcessingSettings>({
    removeBackground: false,
    backgroundTolerance: 20,
    homogenize: true,
    targetSize: 512,
    padding: 10,
  });

  // Stats
  const [processedCount, setProcessedCount] = useState(0);

  // Load Image
  const handleFileSelect = (file: File) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      setSourceImage(img);
      setStep(ProcessingStep.SETTINGS);
      URL.revokeObjectURL(objectUrl);
    };
  };

  // Preview Logic for Settings Step
  useEffect(() => {
    if (step === ProcessingStep.SETTINGS && sourceImage && previewCanvasRef.current) {
      const ctx = previewCanvasRef.current.getContext('2d');
      if (!ctx) return;

      previewCanvasRef.current.width = sourceImage.width;
      previewCanvasRef.current.height = sourceImage.height;
      ctx.drawImage(sourceImage, 0, 0);

      // Apply preview of background removal
      if (settings.removeBackground) {
        removeBackground(previewCanvasRef.current, settings.backgroundTolerance);
      }
    }
  }, [step, sourceImage, settings.removeBackground, settings.backgroundTolerance]);


  const startProcessing = () => {
    setStep(ProcessingStep.PROCESSING);
  };

  // Automated Splitting Effect
  useEffect(() => {
    if (step === ProcessingStep.PROCESSING && sourceImage && canvasRef.current) {
      const process = async () => {
        try {
          // Prepare Canvas
          const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          canvasRef.current!.width = sourceImage.width;
          canvasRef.current!.height = sourceImage.height;
          ctx.drawImage(sourceImage, 0, 0);

          // 1. Remove Background (if requested)
          if (settings.removeBackground) {
            removeBackground(canvasRef.current!, settings.backgroundTolerance);
          }

          // 2. Detect Boxes (on the potentially transparent canvas)
          const boxes = findSprites(canvasRef.current!);
          
          if (boxes.length === 0) {
            alert("No distinct sprites found. Try adjusting background removal.");
            setStep(ProcessingStep.SETTINGS);
            return;
          }

          // 3. Create Asset Objects (Crop & Resize)
          const initialAssets: Asset[] = await Promise.all(boxes.map(async (box, index) => {
            const blob = await cropImage(canvasRef.current!, box, settings);
            
            // Calculate final dimensions for UI display
            const isHomogenized = settings.homogenize;
            // If homogenized, strictly use targetSize. 
            // If not, use box size + the fixed margin (2px * 2) from cropImage logic.
            const outputWidth = isHomogenized ? settings.targetSize : box.width + 4;
            const outputHeight = isHomogenized ? settings.targetSize : box.height + 4;

            return {
              id: `asset-${index}-${Date.now()}`,
              originalName: '',
              finalName: `item_${index + 1}`,
              blob,
              previewUrl: URL.createObjectURL(blob),
              box,
              outputWidth,
              outputHeight,
              status: 'pending' as const
            };
          }));

          setAssets(initialAssets);
          setStep(ProcessingStep.REVIEW);
          
          // 4. Start Background AI Naming
          queueAiNaming(initialAssets);

        } catch (err) {
          console.error("Processing failed", err);
          alert("Failed to process image. See console for details.");
          setStep(ProcessingStep.UPLOAD);
        }
      };
      
      process();
    }
  }, [step, sourceImage, settings]); // Added settings to dependency array to ensure latest values are used

  // AI Queue Management
  const queueAiNaming = async (currentAssets: Asset[]) => {
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < currentAssets.length; i += BATCH_SIZE) {
      const batch = currentAssets.slice(i, i + BATCH_SIZE);
      
      const promises = batch.map(async (asset) => {
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'naming' } : a));
        const name = await identifyAsset(asset.blob);
        setAssets(prev => prev.map(a => {
           if (a.id === asset.id) {
             return { ...a, originalName: name, finalName: name, status: 'ready' };
           }
           return a;
        }));
        setProcessedCount(prev => prev + 1);
      });

      await Promise.all(promises);
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
      <header className="border-b border-gray-800 bg-gray-900 sticky top-0 z-50">
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
            <div className="max-w-2xl mx-auto mt-20 animate-fade-in">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-white mb-4">
                  Turn Sprite Sheets into <br/>
                  <span className="text-blue-400">Named Assets instantly</span>
                </h2>
                <p className="text-gray-400 text-lg">
                  Upload a grid or sprite sheet. We'll split it, format it, and name it.
                </p>
              </div>
              <Dropzone onFileSelect={handleFileSelect} />
            </div>
          )}

          {step === ProcessingStep.SETTINGS && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
              {/* Image Preview Side */}
              <div className="lg:col-span-2 bg-gray-800 rounded-2xl p-6 border border-gray-700 flex flex-col">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Box className="text-blue-400" size={20}/> 
                  Input Preview
                </h3>
                <div className="flex-grow flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/black-linen.png')] bg-gray-900 rounded-xl overflow-auto border border-gray-700 relative">
                  <canvas ref={previewCanvasRef} className="max-w-full max-h-[60vh] object-contain shadow-lg" />
                  {settings.removeBackground && (
                    <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded text-xs text-green-400 border border-green-900">
                      Preview: Background Removal Active
                    </div>
                  )}
                </div>
              </div>

              {/* Controls Side */}
              <div className="lg:col-span-1 bg-gray-800 rounded-2xl p-6 border border-gray-700 flex flex-col gap-6">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                    <Settings2 size={24} className="text-blue-400" />
                    Configure Output
                  </h3>
                  <p className="text-sm text-gray-400">Adjust how your sprites are processed.</p>
                </div>

                <div className="space-y-6">
                  {/* Background Removal */}
                  <div className="bg-gray-750 p-4 rounded-xl border border-gray-700 bg-gray-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white font-medium">Remove Background</label>
                      <input 
                        type="checkbox" 
                        checked={settings.removeBackground} 
                        onChange={(e) => setSettings(s => ({ ...s, removeBackground: e.target.checked }))}
                        className="w-5 h-5 accent-blue-500 rounded cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Automatically detects and removes the background color based on the top-left pixel.
                    </p>
                    {settings.removeBackground && (
                      <div className="flex flex-col gap-1 animate-fade-in">
                        <label className="text-xs text-gray-400 flex justify-between">
                          Tolerance <span>{settings.backgroundTolerance}%</span>
                        </label>
                        <input 
                          type="range" min="1" max="100" 
                          value={settings.backgroundTolerance}
                          onChange={(e) => setSettings(s => ({ ...s, backgroundTolerance: Number(e.target.value) }))}
                          className="w-full accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  {/* Sizing */}
                  <div className="bg-gray-750 p-4 rounded-xl border border-gray-700 bg-gray-900/50">
                     <div className="flex items-center justify-between mb-2">
                        <label className="text-white font-medium">Homogenize Size</label>
                        <input 
                          type="checkbox" 
                          checked={settings.homogenize} 
                          onChange={(e) => setSettings(s => ({ ...s, homogenize: e.target.checked }))}
                          className="w-5 h-5 accent-blue-500 rounded cursor-pointer"
                        />
                     </div>
                     <p className="text-xs text-gray-500 mb-3">
                       Scales every sprite to fit squarely into a standard dimension.
                     </p>
                     
                     {settings.homogenize && (
                       <div className="space-y-4 animate-fade-in">
                         <div>
                            <label className="text-xs text-gray-400 block mb-1">Output Resolution</label>
                            <select 
                              value={settings.targetSize}
                              onChange={(e) => setSettings(s => ({ ...s, targetSize: Number(e.target.value) }))}
                              className="w-full bg-gray-700 border border-gray-600 text-white rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="64">64 x 64 px</option>
                              <option value="128">128 x 128 px</option>
                              <option value="256">256 x 256 px</option>
                              <option value="512">512 x 512 px</option>
                              <option value="1024">1024 x 1024 px</option>
                            </select>
                         </div>
                         <div>
                            <label className="text-xs text-gray-400 flex justify-between mb-1">
                              Padding/Margin <span>{settings.padding}%</span>
                            </label>
                            <input 
                              type="range" min="0" max="40" 
                              value={settings.padding}
                              onChange={(e) => setSettings(s => ({ ...s, padding: Number(e.target.value) }))}
                              className="w-full accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                         </div>
                       </div>
                     )}
                  </div>
                </div>

                <div className="mt-auto flex gap-3">
                  <button 
                    onClick={handleReset}
                    className="px-4 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={startProcessing}
                    className="flex-grow flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-3 rounded-lg font-bold shadow-lg shadow-blue-900/50 transition-all transform active:scale-95"
                  >
                    <Play size={18} fill="currentColor" />
                    Process Sprites
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === ProcessingStep.PROCESSING && (
             <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
               <div className="relative">
                 <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full"></div>
                 <Wand2 className="w-16 h-16 text-blue-400 animate-pulse relative z-10" />
               </div>
               <h3 className="text-2xl font-semibold">Analyzing & Slicing...</h3>
               <p className="text-gray-400">Applying background removal and resizing logic.</p>
             </div>
          )}

          {step === ProcessingStep.REVIEW && (
            <div className="space-y-8 animate-fade-in">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700">
                 <button 
                   onClick={handleReset}
                   className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                 >
                   <ArrowLeft size={18} />
                   Start Over
                 </button>
                 <div className="h-6 w-px bg-gray-700 mx-2 hidden md:block"></div>
                 <h2 className="text-lg font-semibold flex items-center gap-2">
                    Found {assets.length} Assets
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-normal">
                      {settings.homogenize ? `${settings.targetSize}x${settings.targetSize}` : 'Original Size'}
                    </span>
                 </h2>
                 <div className="flex-grow"></div>
                 {assets.length > 0 && (
                    <div className="flex gap-2">
                       <button onClick={handleDownloadAll} className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors flex items-center gap-2">
                          <Download size={16} /> Save All
                       </button>
                    </div>
                 )}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
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
                   <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                   <h3 className="text-xl font-bold text-white mb-2">No Sprites Detected</h3>
                   <p className="text-gray-400 max-w-md mx-auto mb-6">
                     We couldn't separate distinct items. This usually happens if the background wasn't removed correctly or tolerance was too high/low.
                   </p>
                   <button onClick={handleReset} className="text-blue-400 hover:underline">
                     Try adjusting settings
                   </button>
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