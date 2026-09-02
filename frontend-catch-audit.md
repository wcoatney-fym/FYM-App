# Frontend Catch-Block Audit: Empty-Array-on-Error Pattern

**Date:** 2026-09-02  
**Fixed:** `LeaderboardPage.tsx` (see branch `fix/jsonresponse-signature-swap`)  
**Status of remaining:** Documented below — not yet fixed.

---

## Grep Results

```
grep -rn 'catch.*err\|\.catch(' src/ --include="*.tsx" --include="*.ts" -A3 | grep 'set.*\[\]'
```

| File | Line | Statement |
|------|------|-----------|
| `src/components/search/PolicySearchPalette.tsx` | 103 | `setResults([])` |
| `src/pages/ProductionPage.tsx` | 331 | `setAgentBreakdown([])` |
| `src/pages/AgencyRosterPage.tsx` | 464 | `setAgentPolicies([])` |
| `src/pages/LeaderboardPage.tsx` | 400 | `setAgentRows([])` — **FIXED** |
| `src/pages/contracting/carrier-upload/AgentSearchPicker.tsx` | 71 | `setResults([])` |

---

## Detailed Findings

### 1. `src/pages/ProductionPage.tsx` — `setAgentBreakdown([])`

**Catch block (line ~329-332):**
```ts
.catch(err => {
  console.error('Agent breakdown load error:', err);
  if (!cancelled) setAgentBreakdown([]);
})
```

**Empty-state render (line ~1065):**
```tsx
<TableRow>
  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground text-sm">
    No agents found
  </TableCell>
</TableRow>
```

**Verdict:** 🐛 **Same bug.** On fetch failure, `agentBreakdown` is set to `[]`, which renders "No agents found" — misleading the user into thinking there are no agents rather than showing an error. This is user-facing production data (the agent breakdown table on the Production page).

**Severity:** High — this is a primary data view for agency managers.

---

### 2. `src/pages/AgencyRosterPage.tsx` — `setAgentPolicies([])`

**Catch block (line ~463-465):**
```ts
} catch (err) {
  console.error('Error loading agent policies from prod:', err);
  setAgentPolicies([]);
}
```

**Empty-state render (line ~891):**
```
No policies found for this agent's writing numbers.
```

**Verdict:** 🐛 **Same bug.** When the prod DB query fails (network error, timeout, etc.), the user sees "No policies found for this agent's writing numbers." — which looks like the agent genuinely has no policies. This is a drill-down view after clicking an agent in the roster.

**Severity:** Medium-High — misleading for individual agent policy review, but scoped to the drill-down modal (not the main roster table).

---

### 3. `src/pages/contracting/carrier-upload/AgentSearchPicker.tsx` — `setResults([])`

**Catch block (line ~65-72):**
```ts
if (error) {
  console.error('[AgentSearchPicker] Search error:', error);
  setResults([]);
} else {
  setResults((data as AgentResult[]) || []);
}
// ...
} catch (err) {
  console.error('[AgentSearchPicker] Search failed:', err);
  setResults([]);
}
```

**Empty-state render:** The component is a search autocomplete picker. Empty results = no dropdown items shown. There is no explicit "no results" message — the picker simply shows nothing.

**Verdict:** ⚠️ **Acceptable.** This is a search-as-you-type autocomplete for agent lookup during carrier uploads. Clearing results on error is standard UX for search pickers — the user naturally retries by typing more. No misleading "no data" message is shown. A subtle inline error indicator would be a polish item, not a bug.

**Severity:** Low — search autocomplete, not a data display.

---

### 4. `src/components/search/PolicySearchPalette.tsx` — `setResults([])`

**Catch block (line ~102-104):**
```ts
} catch (err) {
  console.error('[PolicySearchPalette] search error:', err);
  setResults([]);
}
```

**Empty-state render:** This is the Cmd+K / global policy search palette. Empty results show a "No results" type message in the search overlay.

**Verdict:** ⚠️ **Acceptable.** Same reasoning as AgentSearchPicker — this is ephemeral search UI, not persistent data display. The user naturally retries. Clearing results on error is standard for search palettes. A subtle toast or inline error hint would be polish.

**Severity:** Low — search UI, not a data view.

---

## Summary

| File | Component | User-Facing Data? | Same Bug? | Fix Priority |
|------|-----------|-------------------|-----------|-------------|
| `LeaderboardPage.tsx` | Agent Leaderboard | ✅ Yes | ✅ Yes | ✅ **FIXED** |
| `ProductionPage.tsx` | Agent Breakdown Table | ✅ Yes | ✅ Yes | 🔴 **High** |
| `AgencyRosterPage.tsx` | Agent Policy Drill-down | ✅ Yes | ✅ Yes | 🟠 **Medium-High** |
| `AgentSearchPicker.tsx` | Search Autocomplete | ❌ Search UI | ❌ Acceptable | 🟢 Low (polish) |
| `PolicySearchPalette.tsx` | Global Search Palette | ❌ Search UI | ❌ Acceptable | 🟢 Low (polish) |

**Recommendation:** Fix `ProductionPage.tsx` and `AgencyRosterPage.tsx` with the same error-state pattern used in the Leaderboard fix: dedicated error state, keep stale data visible, show a destructive-styled error banner with retry guidance.
