/**
 * UploadZone — drag-and-drop / click-to-upload area for CSV files.
 *
 * Handles file validation (extension + size guard) and delegates
 * parsing to the parent via onFileAccepted.
 */
import React, { useRef, useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { MAX_CSV_BYTES } from '@/lib/contracting/roster-import-types';

interface UploadZoneProps {
  onFileAccepted: (file: File) => void;
  onError: (message: string) => void;
}

export function UploadZone({ onFileAccepted, onError }: UploadZoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const validate = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        onError('Please upload a .csv file.');
        return;
      }
      if (file.size > MAX_CSV_BYTES) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        onError(`File is too large (${sizeMB} MB). Maximum allowed is 2 MB.`);
        return;
      }
      onFileAccepted(file);
    },
    [onFileAccepted, onError],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validate(file);
    },
    [validate],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validate(file);
    },
    [validate],
  );

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-primary/50 bg-secondary/20'
          : 'border-border hover:border-primary/40 hover:bg-secondary/20'
      }`}
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-semibold text-foreground/80">
        Click to upload or drag and drop a CSV
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Required columns: first_name, last_name, npn · Optional: email, phone,
        agency, resident_state · Max 2 MB
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
