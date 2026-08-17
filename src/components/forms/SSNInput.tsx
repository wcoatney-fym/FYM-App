/**
 * SSNInput — ported from contracting-portal
 *
 * Formatted SSN entry with auto-advance between segments.
 */
import { useState, useRef } from 'react';

interface SSNInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function SSNInput({ value, onChange, required = true }: SSNInputProps) {
  const [part1, setPart1] = useState(value.slice(0, 3));
  const [part2, setPart2] = useState(value.slice(3, 5));
  const [part3, setPart3] = useState(value.slice(5, 9));

  const input2Ref = useRef<HTMLInputElement>(null);
  const input3Ref = useRef<HTMLInputElement>(null);

  const handlePart1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 3);
    setPart1(val);
    onChange(val + part2 + part3);
    if (val.length === 3) input2Ref.current?.focus();
  };

  const handlePart2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setPart2(val);
    onChange(part1 + val + part3);
    if (val.length === 2) input3Ref.current?.focus();
  };

  const handlePart3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPart3(val);
    onChange(part1 + part2 + val);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={part1}
        onChange={handlePart1Change}
        className="w-16 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent text-center"
        maxLength={3}
        required={required}
      />
      <span className="text-gray-400">-</span>
      <input
        ref={input2Ref}
        type="text"
        value={part2}
        onChange={handlePart2Change}
        className="w-12 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent text-center"
        maxLength={2}
        required={required}
      />
      <span className="text-gray-400">-</span>
      <input
        ref={input3Ref}
        type="text"
        value={part3}
        onChange={handlePart3Change}
        className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent text-center"
        maxLength={4}
        required={required}
      />
    </div>
  );
}
