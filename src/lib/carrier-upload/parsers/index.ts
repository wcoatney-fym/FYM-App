/**
 * Carrier parser registry — maps carrier name to its parser.
 *
 * To add a new carrier:
 * 1. Create a new parser file in this directory
 * 2. Register it here
 * 3. Add the carrier name to SUPPORTED_CARRIERS in ../types.ts
 */
export { parseManhattanReport } from './manhattan';
export { parseGtlReport } from './gtl';
