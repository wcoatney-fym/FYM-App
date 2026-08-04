/**
 * useDashboardLayout — Manages dashboard widget visibility and order.
 *
 * Per PRD spec:
 * - Each widget can be toggled on/off (except locked widgets)
 * - Widgets can be reordered via drag-and-drop
 * - Layout persisted to localStorage keyed by user role
 * - Locked widgets (Needs Attention, Quality) are always shown
 */
import { useState, useCallback, useEffect } from 'react';

export interface DashboardWidget {
  id: string;
  label: string;
  description: string;
  locked: boolean;
  visible: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  version: number;
}

/** Default widget configuration — order matters */
const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: 'kpi-strip',
    label: 'KPI strip',
    description: 'Active policies, premium, retention gauge, at-risk count',
    locked: false,
    visible: true,
  },
  {
    id: 'production-snapshot',
    label: 'Production snapshot',
    description: 'Status breakdown with policy counts and premium by status',
    locked: false,
    visible: true,
  },
  {
    id: 'quality-card',
    label: 'Quality snapshot',
    description: 'Required by FYM — quality signals leadership tracks',
    locked: true,
    visible: true,
  },
  {
    id: 'retention-trend',
    label: 'Retention trend chart',
    description: 'Monthly cohort retention trend line',
    locked: false,
    visible: true,
  },
  {
    id: 'agencies-coaching',
    label: 'Agencies needing coaching',
    description: 'Bottom agencies by retention — coaching targets',
    locked: false,
    visible: true,
  },
];

const STORAGE_KEY = 'fym-dashboard-layout';
const LAYOUT_VERSION = 1;

function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { widgets: DEFAULT_WIDGETS, version: LAYOUT_VERSION };

    const parsed = JSON.parse(raw) as DashboardLayout;

    // Merge with defaults to handle new widgets added in updates
    const existingIds = new Set(parsed.widgets.map(w => w.id));
    const merged = [...parsed.widgets];

    for (const def of DEFAULT_WIDGETS) {
      if (!existingIds.has(def.id)) {
        merged.push(def);
      }
    }

    // Enforce locked widgets are always visible
    for (const w of merged) {
      const def = DEFAULT_WIDGETS.find(d => d.id === w.id);
      if (def?.locked) {
        w.locked = true;
        w.visible = true;
      }
    }

    return { widgets: merged, version: LAYOUT_VERSION };
  } catch {
    return { widgets: DEFAULT_WIDGETS, version: LAYOUT_VERSION };
  }
}

function saveLayout(layout: DashboardLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage quota exceeded — silently fail
  }
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);

  // Persist on change
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const toggleWidget = useCallback((widgetId: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === widgetId && !w.locked
          ? { ...w, visible: !w.visible }
          : w
      ),
    }));
  }, []);

  const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const next = [...prev.widgets];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, widgets: next };
    });
  }, []);

  const resetLayout = useCallback(() => {
    setLayout({ widgets: DEFAULT_WIDGETS, version: LAYOUT_VERSION });
  }, []);

  const isWidgetVisible = useCallback((widgetId: string) => {
    const w = layout.widgets.find(w => w.id === widgetId);
    return w?.visible ?? true;
  }, [layout]);

  /** Get ordered list of visible widget IDs */
  const visibleWidgetOrder = layout.widgets
    .filter(w => w.visible)
    .map(w => w.id);

  return {
    layout,
    widgets: layout.widgets,
    visibleWidgetOrder,
    toggleWidget,
    reorderWidgets,
    resetLayout,
    isWidgetVisible,
  };
}
