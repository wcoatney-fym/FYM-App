export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]);
  let dataStartIdx = 1;

  const emptyTrailingCount = countEmptyTrailing(headers);
  if (emptyTrailingCount > 0 && lines.length > 1) {
    const nextValues = parseLine(lines[1]);
    const nextNonEmpty = nextValues.filter((v) => v !== '');
    if (nextNonEmpty.length <= emptyTrailingCount && nextNonEmpty.length > 0) {
      const firstEmptyIdx = headers.length - emptyTrailingCount;
      for (let j = 0; j < nextNonEmpty.length; j++) {
        headers[firstEmptyIdx + j] = nextNonEmpty[j];
      }
      dataStartIdx = 2;
    }
  }

  headers.forEach((h, idx) => {
    if (h === '') headers[idx] = `Column ${idx + 1}`;
  });

  const headerSet = new Set(headers.map((h) => h.toLowerCase()));
  const rows: Record<string, string>[] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const nonEmpty = values.filter((v) => v !== '');
    const isSubHeader =
      nonEmpty.length > 0 &&
      nonEmpty.every((v) => headerSet.has(v.toLowerCase()));
    const isSparseRow =
      headers.length >= 4 && nonEmpty.length <= 2 && nonEmpty.length < headers.length * 0.25;
    if (isSubHeader || isSparseRow) {
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function countEmptyTrailing(arr: string[]): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] === '') count++;
    else break;
  }
  return count;
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}
