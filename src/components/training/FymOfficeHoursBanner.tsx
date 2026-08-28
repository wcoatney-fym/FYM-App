/**
 * FYM Office Hours Banner — shared between agent Training page and admin
 * Contracting Training tab.
 *
 * Shows a live/offline Zoom link banner with auto-refresh every 60s.
 * Office hours: Mon–Fri 8 AM – 8 PM CT.
 */
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, Clock, ExternalLink } from 'lucide-react';

const FYM_OFFICE_HOURS_URL =
  'https://teamfym.zoom.us/j/89124065004?pwd=XAtmDW2hthFYjpPrRNipdgAPC0dJ9S.1';

/** Returns true if FYM Office Hours is currently live (Mon–Fri 8am–8pm CT) */
function isOfficeHoursLive(): boolean {
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day = ct.getDay(); // 0=Sun, 6=Sat
  const hour = ct.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 20;
}

export function FymOfficeHoursBanner() {
  const [live, setLive] = useState(isOfficeHoursLive);

  // Re-check live status every minute
  useEffect(() => {
    const interval = setInterval(() => setLive(isOfficeHoursLive()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <a
      href={FYM_OFFICE_HOURS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className={`border-2 overflow-hidden transition-all duration-300 ${
        live
          ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent hover:border-emerald-500/60'
          : 'border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent hover:border-cyan-500/50'
      }`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`p-3 rounded-xl ring-1 shrink-0 ${
                live
                  ? 'bg-emerald-500/15 ring-emerald-500/30'
                  : 'bg-cyan-500/15 ring-cyan-500/30'
              }`}>
                <Video className={`w-6 h-6 ${live ? 'text-emerald-400' : 'text-cyan-400'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-bold text-foreground">FYM Office Hours</h3>
                  {live ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs gap-1 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      LIVE NOW
                    </Badge>
                  ) : (
                    <Badge className="bg-secondary/40 text-muted-foreground border-border text-xs">
                      Offline
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Mon – Fri · 8:00 AM – 8:00 PM CT
                </p>
              </div>
            </div>
            <div className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0 ${
              live
                ? 'bg-emerald-500 text-black group-hover:bg-emerald-400'
                : 'bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/25'
            }`}>
              <ExternalLink className="w-4 h-4" />
              {live ? 'Join Now' : 'Open Link'}
            </div>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

export { FYM_OFFICE_HOURS_URL };

/** FYM Direct agency UUID — used for visibility gating */
export const FYM_AGENCY_ID = '338230f2-2058-407c-9507-5aa88d6d5e14';
