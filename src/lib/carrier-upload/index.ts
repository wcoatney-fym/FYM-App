/**
 * Carrier Hierarchy Report Upload — barrel export
 */
export {
  processCarrierUpload,
  resolveMatch,
  applySingleAgentMatch,
  addNewAgentFromCarrier,
} from './orchestrator';

export { parseManhattanReport } from './parsers/manhattan';
export { parseGtlReport } from './parsers/gtl';

export { matchAgents, matchAgencies } from './match-engine';

export type {
  SupportedCarrier,
  NormalizedCarrierAgent,
  NormalizedCarrierAgency,
  CarrierParseResult,
  CarrierUploadReport,
  AgentMatchResult,
  AgencyMatchResult,
  CarrierEntityAlias,
  MatchTier,
} from './types';

export { SUPPORTED_CARRIERS, buildCarrierTag } from './types';
