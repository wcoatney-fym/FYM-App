import { create } from 'zustand';
import {
  LeadGenAd, LeadGenFollowUp, RecruitingAd, RecruitingFollowUp,
  RetentionAgent, PersistencyRecord, Placement, Cancellation, RevenueRecord
} from '@/lib/command-center/types';
import {
  mockLeadGenAds, mockLeadGenFollowUp, mockRecruitingAds,
  mockRecruitingFollowUp, mockRetentionAgents, mockPersistency,
  mockPlacements, mockCancellations, mockRevenue
} from '@/lib/command-center/mock-data';

interface PipelineState {
  leadGenAds: LeadGenAd[];
  leadGenFollowUp: LeadGenFollowUp[];
  recruitingAds: RecruitingAd[];
  recruitingFollowUp: RecruitingFollowUp[];
  retentionAgents: RetentionAgent[];
  persistency: PersistencyRecord[];
  placements: Placement[];
  cancellations: Cancellation[];
  revenue: RevenueRecord[];
  mockDataLoaded: boolean;
  loadMockData: () => void;
  clearMockData: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  leadGenAds: [],
  leadGenFollowUp: [],
  recruitingAds: [],
  recruitingFollowUp: [],
  retentionAgents: [],
  persistency: [],
  placements: [],
  cancellations: [],
  revenue: [],
  mockDataLoaded: false,
  loadMockData: () => set({
    leadGenAds: mockLeadGenAds,
    leadGenFollowUp: mockLeadGenFollowUp,
    recruitingAds: mockRecruitingAds,
    recruitingFollowUp: mockRecruitingFollowUp,
    retentionAgents: mockRetentionAgents,
    persistency: mockPersistency,
    placements: mockPlacements,
    cancellations: mockCancellations,
    revenue: mockRevenue,
    mockDataLoaded: true,
  }),
  clearMockData: () => set({
    leadGenAds: [],
    leadGenFollowUp: [],
    recruitingAds: [],
    recruitingFollowUp: [],
    retentionAgents: [],
    persistency: [],
    placements: [],
    cancellations: [],
    revenue: [],
    mockDataLoaded: false,
  }),
}));
