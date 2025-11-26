import React from 'react';
import { Asset } from '../types';
import { Loader2, Check, Edit2, Download, AlertCircle } from 'lucide-react';

interface AssetCardProps {
  asset: Asset;
  onRename: (id: string, newName: string) => void;
  onDownload: (asset: Asset) => void;
}

export const AssetCard: React.FC<AssetCardProps> = ({ asset, onRename, onDownload }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleEditSubmit = () => {
    if (inputRef.current) {
      onRename(asset.id, inputRef.current.value);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditSubmit();
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 hover:border-gray-600 transition-all flex flex-col">
      <div className="h-32 bg-[url('https://www.transparenttextures.com/patterns/black-linen.png')] bg-gray-900 flex items-center justify-center p-4 relative group">
        <img 
          src={asset.previewUrl} 
          alt={asset.finalName} 
          className="max-w-full max-h-full object-contain drop-shadow-md transition-transform group-hover:scale-110" 
        />
        {asset.status === 'naming' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
             <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                <span className="text-xs text-blue-200 font-medium">AI Naming...</span>
             </div>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-grow">
        <div className="flex items-center justify-between">
           {isEditing ? (
             <div className="flex items-center gap-1 w-full">
               <input 
                 ref={inputRef}
                 defaultValue={asset.finalName}
                 className="w-full bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                 autoFocus
                 onBlur={handleEditSubmit}
                 onKeyDown={handleKeyDown}
               />
               <button onClick={handleEditSubmit} className="text-green-400 hover:bg-gray-700 p-1 rounded">
                 <Check size={14} />
               </button>
             </div>
           ) : (
             <div className="flex items-center gap-2 w-full group/title">
                <span 
                  className="font-mono text-sm text-gray-200 truncate flex-grow cursor-pointer" 
                  title={asset.finalName}
                  onClick={() => setIsEditing(true)}
                >
                  {asset.finalName || "..."}
                </span>
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="text-gray-500 hover:text-white opacity-0 group-hover/title:opacity-100 transition-opacity"
                >
                  <Edit2 size={12} />
                </button>
             </div>
           )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-700">
           <span className="text-xs text-gray-500 font-mono">
             {asset.outputWidth}x{asset.outputHeight}px
           </span>
           
           <button 
             onClick={() => onDownload(asset)}
             className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors"
           >
             <Download size={12} />
             Save
           </button>
        </div>
      </div>
    </div>
  );
};