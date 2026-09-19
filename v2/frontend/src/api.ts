/**
 * src/api.ts
 * Layer  : Frontend — client HTTP
 * Role   : Toutes les fonctions d'appel à l'API Django v2.
 *          Gère l'en-tête Authorization: Token pour les actions authentifiées.
 *          Exporte aussi les helpers OIDC (URLs de login/logout).
 */

import { mockGoogleLogin, mockLogin, mockRegister } from "./lib/mockApi";
import type {
  AdminAccountDetailResponse,
  AdminOverviewResponse,
  AccountRole,
  AssignmentStatus,
  AuthResponse,
  AuthUser,
  AvailabilityStatus,
  ClientContact,
  ClientDashboardResponse,
  ContactProfile,
  Experience,
  Facture,
  FactureStatus,
  FreelancerProfile,
  Mission,
  MissionMode,
  MissionTemplate,
  MissionTemplateMode,
  MissionStatus,
  ProfileContact,
  ProfileOverview,
  Restaurant,
  RestaurantMember,
  RestaurantShift,
  ShiftAssignment,
  ShiftAvailability,
  Skill,
  Slot,
  Unavailability,
} from "./types";

// Re-export AuthUser so pages that already import from "./api" keep working
export type { AuthUser, AuthResponse };

const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8002/api").replace(/\/$/, "");
const AUTH_SERVER_URL = (import.meta.env.VITE_AUTH_SERVER_URL ?? "https://auth.pascuans.dev").replace(/\/$/, "");

export const isMockApiEnabled = import.meta.env.VITE_USE_MOCK_API === "true";
export const showLocalDebugAuth =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_LOCAL_DEBUG_AUTH === "true";

export function getDefaultAppPath(user: Pick<AuthUser, "role" | "slug">): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "client") return "/client";
  return user.slug ? `/extras/${user.slug}` : "/profile";
}

// ---------------------------------------------------------------------------
// OIDC helpers
// ---------------------------------------------------------------------------

function appendRoleToUrl(url: string, role?: AccountRole | null): string {
  const nextUrl = new URL(url, window.location.origin);
  if (role !== "client" && role !== "freelance") {
    return nextUrl.toString();
  }

  nextUrl.searchParams.set("role", role);
  return nextUrl.toString();
}

export function getOidcLoginUrl(role?: AccountRole | null): string {
  return appendRoleToUrl(`${API_URL}/auth/social/login/pascuans_oidc/`, role);
}

export function getOidcRegisterUrl(role?: AccountRole | null): string {
  const registerUrl = new URL(`${AUTH_SERVER_URL}/register/`);
  registerUrl.searchParams.set("next", getOidcLoginUrl(role));
  if (role === "client" || role === "freelance") {
    registerUrl.searchParams.set("role", role);
  }
  return registerUrl.toString();
}

export function getOidcForgotPasswordUrl(nextUrl?: string): string {
  if (!nextUrl) return `${AUTH_SERVER_URL}/forgot-password/`;
  return `${AUTH_SERVER_URL}/forgot-password/?next=${encodeURIComponent(nextUrl)}`;
}

export function getOidcLogoutUrl(nextUrl: string): string {
  return `${API_URL}/auth/social/logout/?next=${encodeURIComponent(nextUrl)}`;
}

// ---------------------------------------------------------------------------
// Helpers HTTP
// ---------------------------------------------------------------------------

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload.detail === "string") return payload.detail;
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.message === "string") return payload.message;
    if (payload && typeof payload === "object") {
      const messages: string[] = [];
      for (const value of Object.values(payload)) {
        if (typeof value === "string") { messages.push(value); continue; }
        if (Array.isArray(value)) {
          for (const e of value) { if (typeof e === "string") messages.push(e); }
        }
      }
      if (messages.length > 0) return messages.join(" ");
    }
  } catch { /* fall through */ }
  return "Une erreur est survenue.";
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Token ${token}` } : {};
}

async function postJson<T>(path: string, body: object, token?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XmlHttpRequest",
        ...authHeaders(token),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Impossible de joindre l'API Rivebelle sur ${API_URL}. Verifie que le backend Django tourne bien.`
      );
    }
    throw error;
  }
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

async function patchJson<T>(path: string, body: object, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

async function getJson<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

async function putJson<T>(path: string, body: object, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

async function deleteReq(path: string, token: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { ...authHeaders(token) },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(await readErrorMessage(response));
  }
}

// ---------------------------------------------------------------------------
// Auth — local / Google
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (isMockApiEnabled) return mockLogin(email, password);
  return postJson<AuthResponse>("/auth/login/", { email, password });
}

export async function register(
  display_name: string,
  email: string,
  password: string,
  role: AccountRole,
): Promise<AuthResponse> {
  if (isMockApiEnabled) return mockRegister(display_name, email, password);
  return postJson<AuthResponse>("/auth/register/", { display_name, email, password, role });
}

export async function googleLogin(code: string): Promise<AuthResponse> {
  if (isMockApiEnabled) return mockGoogleLogin(code);
  return postJson<AuthResponse>("/auth/google/", { code });
}

// ---------------------------------------------------------------------------
// Espace client
// ---------------------------------------------------------------------------

export interface MissionTemplatePayload {
  name: string;
  establishment: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  instructions?: string;
  establishment_address_line1?: string;
  establishment_address_line2?: string;
  establishment_postal_code?: string;
  establishment_city?: string;
  establishment_country?: string;
  mode?: MissionTemplateMode;
}

export async function fetchClientDashboard(token: string): Promise<ClientDashboardResponse> {
  return getJson<ClientDashboardResponse>("/client/dashboard/", token);
}

export async function fetchClientTemplates(token: string): Promise<MissionTemplate[]> {
  return getJson<MissionTemplate[]>("/client/templates/", token);
}

export async function createClientTemplate(
  data: MissionTemplatePayload,
  token: string
): Promise<MissionTemplate> {
  return postJson<MissionTemplate>("/client/templates/", data, token);
}

export async function updateClientTemplate(
  templateId: number,
  data: Partial<MissionTemplatePayload>,
  token: string
): Promise<MissionTemplate> {
  return patchJson<MissionTemplate>(`/client/templates/${templateId}/`, data, token);
}

export async function deleteClientTemplate(templateId: number, token: string): Promise<void> {
  return deleteReq(`/client/templates/${templateId}/`, token);
}

export async function fetchClientContacts(token: string): Promise<ClientContact[]> {
  return getJson<ClientContact[]>("/client/contacts/", token);
}

export async function createClientContact(profileSlug: string, token: string): Promise<ClientContact> {
  return postJson<ClientContact>("/client/contacts/", { profile_slug: profileSlug }, token);
}

export async function deleteClientContact(contactId: number, token: string): Promise<void> {
  return deleteReq(`/client/contacts/${contactId}/`, token);
}

// ---------------------------------------------------------------------------
// Contacts mutuels
// ---------------------------------------------------------------------------

export async function fetchContacts(token: string): Promise<ProfileContact[]> {
  return getJson<ProfileContact[]>("/contacts/", token);
}

export async function addContact(profileSlug: string, token: string): Promise<ProfileContact> {
  return postJson<ProfileContact>("/contacts/", { profile_slug: profileSlug }, token);
}

export async function removeContact(profileSlug: string, token: string): Promise<void> {
  return deleteReq(`/contacts/${profileSlug}/`, token);
}

export async function fetchContactStatus(profileSlug: string, token: string): Promise<boolean> {
  const res = await getJson<{ is_contact: boolean }>(`/contacts/status/${profileSlug}/`, token);
  return res.is_contact;
}

export async function searchProfiles(q: string, token: string, role?: string): Promise<ContactProfile[]> {
  const params = new URLSearchParams({ q });
  if (role) params.set("role", role);
  return getJson<ContactProfile[]>(`/profiles/search/?${params.toString()}`, token);
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export async function fetchProfileOverview(slug: string, token?: string | null): Promise<ProfileOverview> {
  return getJson<ProfileOverview>(`/profiles/${slug}/`, token);
}

export async function updateProfile(
  slug: string,
  data: Partial<
    Pick<
      FreelancerProfile,
      | "display_name"
      | "avatar_url"
      | "role"
      | "job_title"
      | "location"
      | "bio"
      | "phone"
      | "address_line1"
      | "address_line2"
      | "postal_code"
      | "city"
      | "country"
      | "siret"
      | "legal_status"
      | "vat_number"
      | "vat_notice"
      | "iban"
      | "bic"
      | "hourly_rate"
      | "hourly_rate_public"
      | "currency"
      | "payment_terms"
      | "late_penalties"
    >
  > & {
    avatar_upload_data?: string;
    avatar_remove?: boolean;
  },
  token: string
): Promise<FreelancerProfile> {
  return patchJson<FreelancerProfile>(`/profiles/${slug}/`, data, token);
}

export async function deleteAccount(
  slug: string,
  confirmation: string,
  token: string
): Promise<void> {
  await postJson<{ success: boolean }>(
    `/profiles/${slug}/account/delete/`,
    { confirmation },
    token
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function addSkill(slug: string, name: string, token: string): Promise<Skill> {
  return postJson<Skill>(`/profiles/${slug}/skills/`, { name }, token);
}

export async function deleteSkill(slug: string, skillId: number, token: string): Promise<void> {
  return deleteReq(`/profiles/${slug}/skills/${skillId}/`, token);
}

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

export interface ExperiencePayload {
  title: string;
  company?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  is_current?: boolean;
}

export async function addExperience(
  slug: string,
  data: ExperiencePayload,
  token: string
): Promise<Experience> {
  return postJson<Experience>(`/profiles/${slug}/experiences/`, data, token);
}

export async function updateExperience(
  slug: string,
  experienceId: number,
  data: Partial<ExperiencePayload>,
  token: string
): Promise<Experience> {
  return patchJson<Experience>(`/profiles/${slug}/experiences/${experienceId}/`, data, token);
}

export async function deleteExperience(
  slug: string,
  experienceId: number,
  token: string
): Promise<void> {
  return deleteReq(`/profiles/${slug}/experiences/${experienceId}/`, token);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export async function fetchSlots(slug: string, from: string, to: string, token?: string | null): Promise<Slot[]> {
  return getJson<Slot[]>(`/profiles/${slug}/slots/?from=${from}&to=${to}`, token);
}

export async function createSlot(
  slug: string,
  data: { title: string; start: string; end: string; mission_id?: number | null },
  token: string
): Promise<Slot> {
  return postJson<Slot>(`/profiles/${slug}/slots/`, data, token);
}

export async function updateSlot(
  slug: string,
  slotId: number,
  data: Partial<{ title: string; start: string; end: string; mission_id: number | null }>,
  token: string
): Promise<Slot> {
  return patchJson<Slot>(`/profiles/${slug}/slots/${slotId}/`, data, token);
}

export async function deleteSlot(slug: string, slotId: number, token: string): Promise<void> {
  return deleteReq(`/profiles/${slug}/slots/${slotId}/`, token);
}

// ---------------------------------------------------------------------------
// Unavailabilities
// ---------------------------------------------------------------------------

export async function fetchUnavailabilities(slug: string, token?: string | null): Promise<Unavailability[]> {
  return getJson<Unavailability[]>(`/profiles/${slug}/unavailabilities/`, token);
}

export async function createUnavailability(
  slug: string,
  data: Partial<Omit<Unavailability, "id">>,
  token: string
): Promise<Unavailability> {
  return postJson<Unavailability>(`/profiles/${slug}/unavailabilities/`, data, token);
}

export async function updateUnavailability(
  slug: string,
  unavailabilityId: number,
  data: Partial<Omit<Unavailability, "id">>,
  token: string
): Promise<Unavailability> {
  return patchJson<Unavailability>(`/profiles/${slug}/unavailabilities/${unavailabilityId}/`, data, token);
}

export async function deleteUnavailability(
  slug: string,
  unavailabilityId: number,
  token: string,
  exceptionDate?: string   // YYYY-MM-DD → supprime une seule occurrence
): Promise<Unavailability | void> {
  const qs = exceptionDate ? `?exception=${exceptionDate}` : "";
  if (exceptionDate) {
    return patchJson<Unavailability>(
      `/profiles/${slug}/unavailabilities/${unavailabilityId}/${qs}`,
      {},
      token
    );
  }
  return deleteReq(`/profiles/${slug}/unavailabilities/${unavailabilityId}/`, token);
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export interface MissionSlotPayload {
  title?: string;
  start: string;
  end: string;
}

export interface MissionPayload {
  title?: string;
  description?: string;
  status?: MissionStatus;
  notes?: string;
  establishment?: string;
  establishment_address_line1?: string;
  establishment_address_line2?: string;
  establishment_postal_code?: string;
  establishment_city?: string;
  establishment_country?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  instructions?: string;
  mode?: MissionMode;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  daily_rate?: string | null;
  total_amount?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  slots?: MissionSlotPayload[];
}

export async function fetchMissions(slug: string, token: string, status?: MissionStatus): Promise<Mission[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson<Mission[]>(`/profiles/${slug}/missions/${qs}`, token);
}

export async function createMission(
  slug: string,
  data: MissionPayload,
  token?: string | null
): Promise<Mission> {
  return postJson<Mission>(`/profiles/${slug}/missions/`, data, token);
}

export async function updateMission(
  slug: string,
  missionId: number,
  data: Partial<MissionPayload>,
  token: string
): Promise<Mission> {
  return patchJson<Mission>(`/profiles/${slug}/missions/${missionId}/`, data, token);
}

export async function deleteMission(slug: string, missionId: number, token: string): Promise<void> {
  return deleteReq(`/profiles/${slug}/missions/${missionId}/`, token);
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export interface FacturePayload {
  mission_id?: number | null;
  numero: string;
  date_emission: string;
  status?: FactureStatus;
  client_name: string;
  client_address_ligne1?: string;
  client_address_ligne2?: string;
  client_code_postal?: string;
  client_ville?: string;
  client_pays?: string;
  client_siren?: string;
  client_siret?: string;
  client_vat_number?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  description?: string;
  hours?: string | null;
  rate?: string | null;
  montant_ht: string;
  tva?: string;
  montant_ttc: string;
  mention_tva?: string;
  date_echeance?: string | null;
  conditions_paiement?: string;
  escompte?: string;
  penalites_retard?: string;
  indemnite_recouvrement?: string;
}

export async function fetchFactures(
  slug: string,
  token: string,
  status?: FactureStatus
): Promise<Facture[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson<Facture[]>(`/profiles/${slug}/factures/${qs}`, token);
}

export async function createFacture(
  slug: string,
  data: FacturePayload,
  token: string
): Promise<Facture> {
  return postJson<Facture>(`/profiles/${slug}/factures/`, data, token);
}

export async function updateFacture(
  slug: string,
  factureId: number,
  data: Partial<FacturePayload>,
  token: string
): Promise<Facture> {
  return patchJson<Facture>(`/profiles/${slug}/factures/${factureId}/`, data, token);
}

export async function deleteFacture(slug: string, factureId: number, token: string): Promise<void> {
  return deleteReq(`/profiles/${slug}/factures/${factureId}/`, token);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function fetchAdminOverview(
  token: string,
  filters?: { q?: string; role?: AccountRole | "" | null }
): Promise<AdminOverviewResponse> {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.role) params.set("role", filters.role);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson<AdminOverviewResponse>(`/admin/overview/${suffix}`, token);
}

export async function fetchAdminAccountDetail(
  accountId: number | string,
  token: string
): Promise<AdminAccountDetailResponse> {
  return getJson<AdminAccountDetailResponse>(`/admin/accounts/${accountId}/`, token);
}

// ---------------------------------------------------------------------------
// Resto — restaurants
// ---------------------------------------------------------------------------

const RESTO = "/resto";

export async function fetchRestaurants(): Promise<Restaurant[]> {
  return getJson<Restaurant[]>(`${RESTO}/restaurants/`);
}

export async function fetchMyRestaurants(token: string): Promise<Restaurant[]> {
  return getJson<Restaurant[]>(`${RESTO}/restaurants/me/`, token);
}

export async function fetchRestaurant(slug: string, token?: string | null): Promise<Restaurant> {
  return getJson<Restaurant>(`${RESTO}/restaurants/${slug}/`, token);
}

export interface RestaurantPayload {
  slug?: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  cuisine_type?: string;
  logo_url?: string;
  cover_url?: string;
}

export async function createRestaurant(data: RestaurantPayload, token: string): Promise<Restaurant> {
  return postJson<Restaurant>(`${RESTO}/restaurants/`, data, token);
}

export async function updateRestaurant(
  slug: string,
  data: Partial<RestaurantPayload>,
  token: string
): Promise<Restaurant> {
  return patchJson<Restaurant>(`${RESTO}/restaurants/${slug}/`, data, token);
}

// ---------------------------------------------------------------------------
// Resto — membres
// ---------------------------------------------------------------------------

export interface MemberPayload {
  weekly_hours?: number;
  skills?: string[];
  preferences?: Record<string, number>;
  default_availability?: string;
  name: string;
  position?: string;
  email?: string;
  is_manager?: boolean;
  is_active?: boolean;
  extra_slug?: string;
}

export async function fetchMembers(slug: string, token?: string | null): Promise<RestaurantMember[]> {
  return getJson<RestaurantMember[]>(`${RESTO}/restaurants/${slug}/members/`, token);
}

export async function addMember(slug: string, data: MemberPayload, token: string): Promise<RestaurantMember> {
  return postJson<RestaurantMember>(`${RESTO}/restaurants/${slug}/members/`, data, token);
}

export async function updateMember(
  slug: string,
  memberId: number,
  data: Partial<MemberPayload>,
  token: string
): Promise<RestaurantMember> {
  return patchJson<RestaurantMember>(`${RESTO}/restaurants/${slug}/members/${memberId}/`, data, token);
}

export async function removeMember(slug: string, memberId: number, token: string): Promise<void> {
  return deleteReq(`${RESTO}/restaurants/${slug}/members/${memberId}/`, token);
}

// ---------------------------------------------------------------------------
// Resto — shifts
// ---------------------------------------------------------------------------

export interface ShiftPayload {
  fixed_member_id?: number;
  break_minutes?: number;
  required_skills?: string[];
  repeat_weeks?: number;
  repeat_interval?: number;
  title?: string;
  date: string;
  start_time: string;
  end_time: string;
  service?: string;
  positions_needed?: number;
  position?: string;
  notes?: string;
  status?: string;
}

export async function fetchShifts(
  slug: string,
  token?: string | null,
  params?: { from?: string; to?: string }
): Promise<RestaurantShift[]> {
  const p = new URLSearchParams();
  if (params?.from) p.set("from", params.from);
  if (params?.to) p.set("to", params.to);
  const qs = p.toString() ? `?${p.toString()}` : "";
  return getJson<RestaurantShift[]>(`${RESTO}/restaurants/${slug}/shifts/${qs}`, token);
}

export async function createShift(slug: string, data: ShiftPayload, token: string): Promise<RestaurantShift> {
  return postJson<RestaurantShift>(`${RESTO}/restaurants/${slug}/shifts/`, data, token);
}

export async function updateShift(
  slug: string,
  shiftId: number,
  data: Partial<ShiftPayload>,
  token: string
): Promise<RestaurantShift> {
  return patchJson<RestaurantShift>(`${RESTO}/restaurants/${slug}/shifts/${shiftId}/`, data, token);
}

export async function deleteShift(slug: string, shiftId: number, token: string): Promise<void> {
  return deleteReq(`${RESTO}/restaurants/${slug}/shifts/${shiftId}/`, token);
}

// ---------------------------------------------------------------------------
// Resto — disponibilités & assignations
// ---------------------------------------------------------------------------

export async function setAvailability(
  slug: string,
  shiftId: number,
  status: AvailabilityStatus,
  token: string,
  note?: string
): Promise<ShiftAvailability> {
  return putJson<ShiftAvailability>(
    `${RESTO}/restaurants/${slug}/shifts/${shiftId}/availability/`,
    { status, note: note ?? "" },
    token
  );
}

export async function assignMember(
  slug: string,
  shiftId: number,
  memberId: number,
  token: string
): Promise<ShiftAssignment> {
  return postJson<ShiftAssignment>(
    `${RESTO}/restaurants/${slug}/shifts/${shiftId}/assignments/`,
    { member_id: memberId },
    token
  );
}

export async function updateAssignment(
  slug: string,
  shiftId: number,
  assignmentId: number,
  status: AssignmentStatus,
  token: string
): Promise<ShiftAssignment> {
  return patchJson<ShiftAssignment>(
    `${RESTO}/restaurants/${slug}/shifts/${shiftId}/assignments/${assignmentId}/`,
    { status },
    token
  );
}

export async function removeAssignment(
  slug: string,
  shiftId: number,
  assignmentId: number,
  token: string
): Promise<void> {
  return deleteReq(`${RESTO}/restaurants/${slug}/shifts/${shiftId}/assignments/${assignmentId}/`, token);
}

export function toggleFixedAssignment(slug: string, shiftId: number, assignmentId: number, fixed: boolean, token: string) {
  return patchJson<ShiftAssignment>(`${RESTO}/restaurants/${slug}/shifts/${shiftId}/assignments/${assignmentId}/fixed/`, { fixed }, token);
}

export type MonthlyMemberHours = { member_id: number; name: string; published_minutes: number; draft_minutes: number; target_minutes: number };
export function fetchRestaurantHours(slug: string, month: string, token: string | null) {
  return getJson<MonthlyMemberHours[]>(`${RESTO}/restaurants/${slug}/hours/?month=${month}`, token);
}
export function generateRestaurantPlanning(slug: string, from: string, to: string, token: string) {
  return postJson<{shifts: RestaurantShift[]; warnings: {shift_id: number; missing: number}[]}>(`${RESTO}/restaurants/${slug}/generate/`, {from,to}, token);
}

export function setMemberShiftAvailability(slug: string, shiftId: number, member_id: number, status: AvailabilityStatus, token: string) {
  return putJson<ShiftAvailability>(`${RESTO}/restaurants/${slug}/shifts/${shiftId}/availability/`, {member_id,status}, token);
}

export function fetchServices(slug: string, from: string, to: string, token: string) {
  return getJson<import('./types').RestaurantService[]>(`${RESTO}/restaurants/${slug}/services/?from=${from}&to=${to}`, token);
}
export function createService(slug: string, data: { date: string; definition?: import('./types').ServiceDefinition; template_id?: number; repeat_weeks?: number; repeat_interval?: number; recurring?: boolean }, token: string) {
  return postJson<import('./types').RestaurantService[]>(`${RESTO}/restaurants/${slug}/services/`, data, token);
}
export function editService(slug: string, id: number, data: { definition: import('./types').ServiceDefinition; recurring?: boolean; scope?: "this" | "future" } | { task_key: string; done: boolean }, token: string) {
  return patchJson<import('./types').RestaurantService>(`${RESTO}/restaurants/${slug}/services/${id}/`, data, token);
}
export function deleteService(slug: string, id: number, token: string, scope: "this" | "future" = "this") {
  return deleteReq(`${RESTO}/restaurants/${slug}/services/${id}/?scope=${scope}`, token);
}
export function fetchServiceTemplates(slug: string, token: string) {
  return getJson<import('./types').ServiceTemplate[]>(`${RESTO}/restaurants/${slug}/service-templates/`, token);
}
export function saveServiceTemplate(slug: string, id: number | null, data: { definition: import('./types').ServiceDefinition; weekday: number; apply_future?: boolean }, token: string) {
  const path = `${RESTO}/restaurants/${slug}/service-templates/`;
  return id ? patchJson<import('./types').ServiceTemplate & {updated_services?: number}>(`${path}${id}/`, data, token) : postJson<import('./types').ServiceTemplate>(path, data, token);
}
export function deleteServiceTemplate(slug: string, id: number, token: string) {
  return deleteReq(`${RESTO}/restaurants/${slug}/service-templates/${id}/`, token);
}

export function prepareServices(slug:string,from:string,to:string,token:string) {
  return postJson<{created:number}>(`${RESTO}/restaurants/${slug}/prepare/`,{from,to},token);
}
export function fetchRestaurantSkills(slug:string,token:string) {
  return getJson<string[]>(`${RESTO}/restaurants/${slug}/skills/`,token);
}
export function createRestaurantSkill(slug:string,name:string,member_ids:number[],token:string) {
  return postJson<{name:string;created:boolean}>(`${RESTO}/restaurants/${slug}/skills/`,{name,member_ids},token);
}
export function setEmployeePin(slug:string,id:number,pin:string,token:string) {
  return postJson<{configured:boolean}>(`${RESTO}/restaurants/${slug}/members/${id}/pin/`,{pin},token);
}
export async function employeeApi<T>(slug:string,action:string,token:string|null,data?:object):Promise<T> {
  const response=await fetch(`${API_URL}${RESTO}/restaurants/${slug}/access/${action}/`,{
    method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-Resto-Session':token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  if(!response.ok)throw new Error(await readErrorMessage(response));
  return response.status===204?undefined as T:response.json();
}

export type StaffSlot = {
  id: number; date: string; title: string;
  start: string; end: string; role: string;
  required: string[]; response: string; effective: string;
  assigned: boolean; break_minutes: number;
};
export type MemberBoard = { name: string; default_availability: string; slots: StaffSlot[] };

export async function fetchMyBoard(slug: string, token: string, from: string, to: string): Promise<MemberBoard> {
  return postJson<MemberBoard>(`${RESTO}/restaurants/${slug}/access/my-board/`, { from, to }, token);
}

export async function setMyAvailability(slug: string, token: string, status: string, shiftId?: number): Promise<void> {
  await postJson(`${RESTO}/restaurants/${slug}/access/my-availability/`, { status, shift_id: shiftId ?? null }, token);
}

export async function linkRivebelleAccount(slug: string, employeeToken: string, token: string): Promise<{ linked: boolean; member_name: string }> {
  return postJson(`${RESTO}/restaurants/${slug}/access/link-account/`, { employee_token: employeeToken }, token);
}

// ---------------------------------------------------------------------------
// Dev auth — uniquement en mode développement
// ---------------------------------------------------------------------------

export interface DevAccount {
  id: string;
  slug: string | null;
  email: string;
  display_name: string;
  role: string;
  token: string | null;
  username: string;
}

export async function devListAccounts(): Promise<DevAccount[]> {
  return getJson<DevAccount[]>("/dev/accounts/");
}

export async function devLogin(username: string, displayName: string, role: string): Promise<{ user: AuthUser; access_token: string }> {
  return postJson<{ user: AuthUser; access_token: string }>("/dev/login/", { username, display_name: displayName, role });
}

export async function devDeleteAccount(username: string): Promise<void> {
  await fetch(`${API_URL}/dev/accounts/${encodeURIComponent(username)}/`, { method: "DELETE" });
}
