import React, { useRef } from 'react';
import { Upload, FileSpreadsheet, Eye, RefreshCw, Trash2, UserPlus } from 'lucide-react';

type RosterUpload = {
  id: string;
  file_name: string;
  row_count: number;
  headers: string[];
  uploaded_at: string;
  agency: string;
};

interface AgencyRosterCardProps {
  agency: string;
  upload: RosterUpload | null;
  uploading: boolean;
  populatedCount?: number;
  onUpload: (agency: string, file: File) => void;
  onView: (upload: RosterUpload) => void;
  onDelete: (upload: RosterUpload) => void;
  onAddAgent?: () => void;
}

const DEFAULT_CONFIG = {
  label: 'CRM Roster',
  accent: 'text-foreground/80',
  bg: 'bg-secondary',
  border: 'border-border',
  icon: 'bg-gray-600',
};

const AGENCY_CONFIG: Record<string, { label: string; accent: string; bg: string; border: string; icon: string }> = {
  FYM: {
    label: 'FYM CRM Roster',
    accent: 'text-primary',
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    icon: 'bg-primary',
  },
  Wisechoice: {
    label: 'Wisechoice CRM Roster',
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: 'bg-emerald-500',
  },
  Aspire: {
    label: 'Aspire CRM Roster',
    accent: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: 'bg-amber-500',
  },
};

export const AgencyRosterCard: React.FC<AgencyRosterCardProps> = ({
  agency,
  upload,
  uploading,
  populatedCount,
  onUpload,
  onView,
  onDelete,
  onAddAgent,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = AGENCY_CONFIG[agency] || { ...DEFAULT_CONFIG, label: `${agency} CRM Roster` };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(agency, file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className={`bg-card rounded-xl glow-sm border ${config.border} overflow-hidden transition-shadow hover:glow-primary`}>
      <div className={`${config.bg} px-5 py-4 border-b ${config.border}`}>
        <div className="flex items-center gap-3">
          <div className={`${config.icon} w-9 h-9 rounded-lg flex items-center justify-center`}>
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <h3 className={`text-lg font-bold ${config.accent}`}>{config.label}</h3>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {upload ? (
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate" title={upload.file_name}>
                {upload.file_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {populatedCount !== undefined
                  ? `${populatedCount.toLocaleString()}/200 records`
                  : `${upload.row_count.toLocaleString()} records`}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Uploaded {formatDate(upload.uploaded_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => onView(upload)}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 ${config.icon} text-white rounded-lg hover:opacity-90 transition-all font-medium text-sm`}
            >
              <Eye className="w-4 h-4" />
              View Roster
            </button>
            {onAddAgent && (
              <button
                onClick={onAddAgent}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Add Agent
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 flex-1 px-4 py-2 border border-border text-foreground/80 rounded-lg hover:bg-secondary transition-colors text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replace
              </button>
              <button
                onClick={() => onDelete(upload)}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
              <Upload className="w-5 h-5 text-muted-foreground/70" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">No roster uploaded</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`flex items-center gap-2 px-5 py-2.5 ${config.icon} text-white rounded-lg hover:opacity-90 transition-all font-medium text-sm disabled:opacity-50`}
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
