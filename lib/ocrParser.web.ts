import type { CSVStaffRow } from './csvParser';

export interface OCRParseResult {
  rows: CSVStaffRow[];
  errors: string[];
  totalTips: number | null;
  totalSales: number | null;
  confidence: number;
}

export function parseOCRText(_ocrText: string): OCRParseResult {
  return {
    rows: [],
    errors: ['OCR is not supported on web. Please use CSV import instead.'],
    totalTips: null,
    totalSales: null,
    confidence: 0,
  };
}
