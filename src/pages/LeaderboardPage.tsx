import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { Trophy, TrendingUp } from 'lucide-react';

type LeaderboardRow = Database['public']['Views']['agency_leaderboard']['Row'];

const mockLeaderboard: LeaderboardRow[] = [
  { agent_id: '1', full_name: 'James Mitchell',  agency_id: 'fym', writing_number: 'W-10240', active_count: 63, total_score: 94.2, persistency_score: 38.5, payment_method_score: 19.2, contact_recency_score: 23.1, product_diversity_score: 13.4, agency_rank: 1, fym_rank: 1 },
  { agent_id: '2', full_name: 'Michael Torres',   agency_id: 'fym', writing_number: 'W-10234', active_count: 52, total_score: 91.7, persistency_score: 37.2, payment_method_score: 18.5, contact_recency_score: 22.5, product_diversity_score: 13.5, agency_rank: 2, fym_rank: 2 },
  { agent_id: '3', full_name: 'Lisa Nakamura',    agency_id: 'fym', writing_number: 'W-10241', active_count: 37, total_score: 90.1, persistency_score: 36.8, payment_method_score: 18.0, contact_recency_score: 21.8, product_diversity_score: 13.5, agency_rank: 3, fym_rank: 3 },
  { agent_id: '4', full_name: 'Sarah Chen',       agency_id: 'fym', writing_number: 'W-10235', active_count: 41, total_score: 88.3, persistency_score: 35.5, payment_method_score: 17.6, contact_recency_score: 21.2, product_diversity_score: 14.0, agency_rank: 4, fym_rank: 4 },
  { agent_id: '5', full_name: 'Robert Garcia',    agency_id: 'fym', writing_number: 'W-10238', active_count: 47, total_score: 85.9, persistency_score: 34.2, payment_method_score: 17.2, contact_recency_score: 20.5, product_diversity_score: 14.0, agency_rank: 5, fym_rank: 5 },
  { agent_id: '6', full_name: 'Emily Watson',     agency_id: 'fym', writing_number: 'W-10243', active_count: 33, total_score: 83.4, persistency_score: 33.1, payment_method_score: 16.8, contact_recency_score: 20.0, product_diversity_score: 13.5, agency_rank: 6, fym_rank: 6 },
  { agent_id: '7', full_name: 'Carlos Rivera',    agency_id: 'fym', writing_number: 'W-10242', active_count: 29, total_score: 80.2, persistency_score: 31.8, payment_method_score: 16.2, contact_recency_score: 19.2, product_diversity_score: 13.0, agency_rank: 7, fym_rank: 7 },
  { agent_id: '8', full_name: 'David Williams',   agency_id: 'fym', writing_number: 'W-10236', active_count: 38, total_score: 78.4, persistency_score: 30.5, payment_method_score: 15.8, contact_recency_score: 18.6, product_diversity_score: 13.5, agency_rank: 8, fym_rank: 8 },
];

function scoreColor(score: number) {
  if (score >= 90) return 'text-emerald-700';
  if (score >= 80) return 'text-blue-700';
  if (score >= 70) return 'text-amber-700';
  return 'text-red-700';
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

export function LeaderboardPage() {
  const { role, profile } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>(mockLeaderboard);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('agency_leaderboard')
      .select('*')
      .order('agency_rank', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setRows(data);
      });
  }, []);

  const myRow = rows.find((r) => r.agent_id === profile?.id);

  return (
    <div>
      <Header title="Leaderboard" />
      <div className="p-6 space-y-4">
        {role === 'agent' && myRow && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center flex-shrink-0">
                <Trophy size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Your ranking</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  #{myRow.agency_rank} in your agency · Book Health Score{' '}
                  <span className={`font-bold ${scoreColor(myRow.total_score)}`}>{myRow.total_score}</span>
                </p>
              </div>
              <TrendingUp size={18} className="text-blue-600" />
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">Agency Leaderboard</CardTitle>
              <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">{rows.length} agents</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const isMe = row.agent_id === profile?.id;
                return (
                  <div key={row.agent_id} className={`flex items-center gap-4 px-4 py-3 transition-colors ${isMe ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className="w-8 text-center flex-shrink-0">{rankBadge(row.agency_rank)}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isMe ? 'text-blue-800' : 'text-slate-900'}`}>
                        {row.full_name ?? '—'}{isMe && <span className="ml-1.5 text-xs text-blue-500 font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-400">{row.active_count} active policies</p>
                    </div>
                    <div className="hidden md:flex items-center gap-3 text-xs text-slate-500">
                      <span title="Persistency">P: {row.persistency_score}</span>
                      <span title="Payment mix">$: {row.payment_method_score}</span>
                      <span title="Contact recency">C: {row.contact_recency_score}</span>
                      <span title="Product diversity">D: {row.product_diversity_score}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-lg font-bold ${scoreColor(row.total_score)}`}>{row.total_score}</span>
                      <p className="text-xs text-slate-400">/ 100</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="text-xs text-slate-400 px-1 space-y-0.5">
          <p className="font-medium text-slate-500">Score components</p>
          <p>P = Persistency (40pts) · $ = Payment method mix (20pts) · C = Contact recency (25pts) · D = Product diversity (15pts)</p>
        </div>
      </div>
    </div>
  );
}
