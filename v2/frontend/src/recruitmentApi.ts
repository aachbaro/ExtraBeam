const BASE = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8002/api').replace(/\/$/, '');

export async function recruitmentApi<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method, headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json();
  if (!response.ok) {
    const flatten = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value)
      ? value.map(flatten).join(' ') : value && typeof value === 'object' ? Object.values(value).map(flatten).join(' ') : '';
    throw new Error(flatten(payload) || 'La requête a échoué.');
  }
  return payload as T;
}

export const JOBS: Record<string, string> = { service: 'Service en salle', bar: 'Bar', cuisine: 'Cuisine', plonge: 'Plonge', accueil: 'Accueil', other: 'Autre' };
export const STATES: Record<string, string> = { recruiting: 'Recrutement en cours', exhausted: 'Diffusion terminée', filled: 'Équipe confirmée', canceled: 'Annulée', expired: 'Expirée',
  queued: 'En attente de diffusion', offered: 'Proposition envoyée', interested: 'Intéressé', deferred: 'Revenir en dernier', rejected: 'Refusée', selected: 'Confirmé', declined: 'Non retenu', closed: 'Fermée' };
export interface BriefProfile { slug: string; display_name: string; avatar_url: string }
export interface Offer { id: number; extra: BriefProfile; state: string; wave: number; diffusion_source?: string; offered_at: string | null; mission_id: number | null;
  timesheet: { hours: string; state: string; note: string; invoice_id: number | null } | null }
export interface HiringRequest { id: string; establishment: string; address: string; starts_at: string; ends_at: string; job: string; custom_job: string;
  dress_code: string; notes: string; quantity: number; cascade: boolean; rate_kind: string; rate: string | null; status: string; next_wave_at: string | null;
  is_client: boolean; client: BriefProfile; target: BriefProfile; remaining: number; interested_count: number; offers: Offer[];
  compatible_after?: number; available_after?: number; own_availability?: string; billing_complete?: boolean }
export interface Preferences { email: boolean; push: boolean; sound: boolean; broadcasts: boolean; jobs: string[]; vapid_public_key: string; push_ready: boolean; email_ready: boolean }
export interface NotificationList { unread: number; items: { id: number; title: string; body: string; url: string; read_at: string | null; created_at: string }[] }

export function durationLabel(decimalHours: string) {
  const total = Math.round(Number(decimalHours) * 60);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/** Preserve the exact local destination across local, Google and OIDC login. */
export function rememberHiringReturn(path: string) { sessionStorage.setItem('rivebelle-hiring-return', path); }
export function pendingHiringReturn() {
  const path = sessionStorage.getItem('rivebelle-hiring-return');
  return path && /^\/(extras\/|requests\/|notifications)/.test(path) && !path.includes('\\') ? path : null;
}
export function consumeHiringReturn(fallback: string) {
  const path = pendingHiringReturn();
  sessionStorage.removeItem('rivebelle-hiring-return');
  return path || fallback;
}
