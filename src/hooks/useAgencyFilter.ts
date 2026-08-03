import { useAgencyFilterContext } from '@/contexts/AgencyFilterContext';

/**
 * Thin wrapper around the app-wide AgencyFilterContext.
 *
 * Previously used local useState — agency selection was lost on every
 * tab switch because each page mounted a fresh hook instance.
 * Now reads/writes a single context that lives above the router outlet.
 */
export function useAgencyFilter() {
  return useAgencyFilterContext();
}
