import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndPass(e.target.files[0]);
    }
  };

  const validateAndPass = (file: File) => {
    if (file.type.startsWith('image/')) {
      onFileSelect(file);
    } else {
      alert('Please upload a valid image file (PNG/JPG).');
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        w-full h-96 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
        ${isDragging 
          ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
          : 'border-gray-700 bg-gray-800 hover:bg-gray-750 hover:border-gray-500'
        }
      `}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={handleChange} 
        accept="image/*" 
        className="hidden" 
      />
      
      <div className="bg-gray-700 p-6 rounded-full mb-6">
        <Upload className="w-12 h-12 text-blue-400" />
      </div>
      
      <h3 className="text-2xl font-bold text-white mb-2">Upload Sprite Sheet</h3>
      <p className="text-gray-400 text-center max-w-sm">
        Drag and drop your asset grid here, or click to browse.
        <br />
        <span className="text-sm text-gray-500 mt-2 block">Supports PNG, JPG (Transparent PNG recommended)</span>
      </p>
    </div>
  );
};
