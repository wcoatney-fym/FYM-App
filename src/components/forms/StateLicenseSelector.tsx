/**
 * StateLicenseSelector — ported from contracting-portal
 *
 * Modal for selecting active state licenses.
 * Styled for FYM App dark theme.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { US_STATES } from '@/lib/contracting/types';

interface StateLicenseSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStates: string[];
  onConfirm: (states: string[]) => void;
}

export function StateLicenseSelector({
  isOpen,
  onClose,
  selectedStates,
  onConfirm,
}: StateLicenseSelectorProps) {
  const [selected, setSelected] = useState<string[]>(selectedStates);

  const handleToggle = (state: string) => {
    if (selected.includes(state)) {
      setSelected(selected.filter((s) => s !== state));
    } else {
      setSelected([...selected, state]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === US_STATES.length) {
      setSelected([]);
    } else {
      setSelected([...US_STATES]);
    }
  };

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl border border-border max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-primary">Select Your Active State Licenses</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.length === US_STATES.length}
                onChange={handleSelectAll}
                className="w-4 h-4 text-primary border-border rounded focus:ring-primary bg-secondary"
              />
              <span className="font-medium text-foreground">Select All</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {US_STATES.map((state) => (
              <label key={state} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(state)}
                  onChange={() => handleToggle(state)}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary bg-secondary"
                />
                <span className="text-foreground">{state}</span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-border text-muted-foreground rounded-lg hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
