/**
 * CarrierAvailabilityMap — interactive US map showing carrier
 * availability by state.
 *
 * Agents hover/click a state to see which carriers (UNL, GTL, AHL,
 * Ameritas, Manhattan) are available there.
 *
 * Color coding based on carrier count:
 * - 5 carriers: bright green
 * - 4 carriers: teal
 * - 3 carriers: blue
 * - 2 carriers: amber
 * - 1 carrier: orange
 * - 0 carriers: dark/muted
 */
import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { USStateMap } from './USStateMap';
import {
  STATE_CARRIER_MAP,
  STATE_NAMES,
  CARRIER_KEYS,
  CARRIER_DISPLAY,
  getCarrierCount,
  type CarrierKey,
  type StateCarriers,
} from '@/data/carrier-state-availability';
import { MapPin, Check, X, AlertTriangle } from 'lucide-react';

/** Color scale based on how many carriers are available */
function getStateFillColor(stateCode: string): string {
  const count = getCarrierCount(stateCode);
  switch (count) {
    case 5: return 'hsl(152, 69%, 35%)';  // bright green — all carriers
    case 4: return 'hsl(173, 58%, 32%)';  // teal
    case 3: return 'hsl(199, 65%, 35%)';  // blue
    case 2: return 'hsl(38, 75%, 40%)';   // amber
    case 1: return 'hsl(25, 80%, 40%)';   // orange
    default: return 'hsl(220, 15%, 20%)'; // dark — no carriers
  }
}

function CarrierBadge({
  carrier,
  availability,
}: {
  carrier: CarrierKey;
  availability: { available: boolean; note?: string };
}) {
  const display = CARRIER_DISPLAY[carrier];
  const available = availability.available;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        available
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-muted/10 border-border/30 opacity-50'
      }`}
    >
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: available ? display.color : 'hsl(220, 10%, 30%)' }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${available ? 'text-foreground' : 'text-muted-foreground'}`}>
          {carrier}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">{display.name}</p>
      </div>
      <div className="flex items-center gap-1">
        {available ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <X className="w-4 h-4 text-muted-foreground/50" />
        )}
      </div>
      {availability.note && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
          {availability.note}
        </span>
      )}
    </div>
  );
}

export function CarrierAvailabilityMap() {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const activeState = selectedState || hoveredState;
  const activeCarriers: StateCarriers | null = activeState
    ? STATE_CARRIER_MAP[activeState] ?? null
    : null;
  const activeStateName = activeState ? STATE_NAMES[activeState] ?? activeState : null;
  const activeCount = activeState ? getCarrierCount(activeState) : 0;

  const handleStateHover = useCallback((stateCode: string | null) => {
    setHoveredState(stateCode);
  }, []);

  const handleStateClick = useCallback((stateCode: string) => {
    setSelectedState((prev) => (prev === stateCode ? null : stateCode));
  }, []);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          Carrier Availability by State
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hover or tap a state to see which carriers are available for contracting.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Map */}
          <div className="relative">
            <USStateMap
              onStateHover={handleStateHover}
              onStateClick={handleStateClick}
              selectedState={selectedState}
              getStateFill={getStateFillColor}
            />
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
              {[
                { count: 5, label: 'All 5', color: 'hsl(152, 69%, 35%)' },
                { count: 4, label: '4', color: 'hsl(173, 58%, 32%)' },
                { count: 3, label: '3', color: 'hsl(199, 65%, 35%)' },
                { count: 2, label: '2', color: 'hsl(38, 75%, 40%)' },
                { count: 1, label: '1', color: 'hsl(25, 80%, 40%)' },
                { count: 0, label: 'None', color: 'hsl(220, 15%, 20%)' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded-sm border border-white/10"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:border-l lg:border-border/30 lg:pl-4">
            {activeState && activeCarriers ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{activeStateName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {activeCount} of {CARRIER_KEYS.length} carriers available
                  </p>
                </div>

                {/* Carrier availability count bar */}
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted/20">
                  {CARRIER_KEYS.map((key) => (
                    <div
                      key={key}
                      className="flex-1 transition-colors duration-200"
                      style={{
                        backgroundColor: activeCarriers[key].available
                          ? CARRIER_DISPLAY[key].color
                          : 'hsl(220, 10%, 15%)',
                      }}
                    />
                  ))}
                </div>

                {/* Carrier list */}
                <div className="space-y-1.5">
                  {CARRIER_KEYS.map((key) => (
                    <CarrierBadge
                      key={key}
                      carrier={key}
                      availability={activeCarriers[key]}
                    />
                  ))}
                </div>

                {activeCount === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>No carriers available in this state.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <MapPin className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Select a state</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Hover or tap any state on the map to see carrier availability
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
