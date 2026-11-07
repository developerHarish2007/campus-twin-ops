// Centralized configuration for CampusOps 3D Digital Twin and Dashboard URLs
export const DASHBOARD_URL: string = '/dashboard/';

export const TWIN_URL: string = '/';

/**
 * Switches to the CampusOps Dashboard within the same tab / host.
 * Dispatches an internal navigation event and updates URL query params.
 */
export function openDashboard(onToast?: (message: string) => void): boolean {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('campusops:navigate', { detail: { view: 'dashboard' } }));
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'dashboard');
    window.history.pushState(null, '', url.toString());
    return true;
  }
  return false;
}

/**
 * Navigates back from dashboard to 3D Twin within the same tab / host.
 */
export function openTwinTab(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('campusops:navigate', { detail: { view: 'twin' } }));
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    window.history.pushState(null, '', url.toString());
  }
}

