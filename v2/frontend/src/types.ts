/**
 * src/types.ts
 * Layer  : Frontend — types partagés
 * Role   : Définit les interfaces TypeScript métier utilisées dans toute l'app.
 *          Correspond aux réponses de l'API Django v2.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AccountRole = "freelance" | "client" | "admin";

export interface AuthUser {
  id: string;
  slug: string | null;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: AccountRole;
  auth_provider?: string;
  oidc_sub?: string | null;
  token?: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  access_token: string;
}

// ---------------------------------------------------------------------------
// Profil freelance
// ---------------------------------------------------------------------------

export interface Skill {
  id: number;
  name: string;
}

export interface Experience {
  id: number;
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  description: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreelancerProfile {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  role: AccountRole;
  job_title: string;
  location: string;
  bio: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  legal_status: string;
  vat_number: string;
  vat_notice: string;
  iban: string;
  bic: string;
  hourly_rate: string | null;
  hourly_rate_public: boolean;
  currency: string;
  payment_terms: string;
  late_penalties: string;
  subscription_status: string;
  subscription_plan: string;
  subscription_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  email: string;
  skills: Skill[];
  experiences: Experience[];
}

export interface ProfileOverview {
  profile: FreelancerProfile;
  unavailabilities: Unavailability[];
  mode: "owner" | "public";
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export interface Slot {
  id: number;
  title: string;
  start: string;           // ISO datetime "2026-04-08T10:00:00Z"
  end: string;
  mission_id: number | null;
  mission_title: string | null;
}

export interface Unavailability {
  id: number;
  recurrence_type: "once" | "weekly";
  weekday: number | null;  // 1=Lundi … 7=Dimanche
  start_date: string | null;
  start_time: string;      // "HH:MM:SS"
  end_time: string;
  recurrence_end: string | null; // fin de recurrence weekly ou fin de plage pour une indispo ponctuelle
  exceptions: string[];
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export type MissionStatus = "proposée" | "en_cours" | "terminée" | "refusée";
export type MissionMode = "freelance" | "salarie";

export interface MissionSlot {
  id: number;
  title: string;
  start: string;
  end: string;
}

export interface Mission {
  id: number;
  title: string;
  description: string;
  status: MissionStatus;
  notes: string;
  establishment: string;
  establishment_address_line1: string;
  establishment_address_line2: string;
  establishment_postal_code: string;
  establishment_city: string;
  establishment_country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  instructions: string;
  mode: MissionMode;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_company: string;
  daily_rate: string | null;   // DecimalField → string côté API
  total_amount: string | null;
  start_date: string | null;   // "YYYY-MM-DD"
  end_date: string | null;
  slots: MissionSlot[];
  profile_slug: string | null;
  profile_display_name: string;
  client_profile_slug: string | null;
  client_profile_display_name: string | null;
  slot_count: number;          // calculé par le backend
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export type FactureStatus = "pending_payment" | "paid" | "canceled";

export interface Facture {
  id: number;
  mission_id: number | null;
  mission_title: string | null;
  numero: string;
  date_emission: string;
  status: FactureStatus;
  client_name: string;
  client_address_ligne1: string;
  client_address_ligne2: string;
  client_code_postal: string;
  client_ville: string;
  client_pays: string;
  client_siren: string;
  client_siret: string;
  client_vat_number: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  description: string;
  hours: string | null;
  rate: string | null;
  montant_ht: string;
  tva: string;
  montant_ttc: string;
  mention_tva: string;
  date_echeance: string | null;
  conditions_paiement: string;
  escompte: string;
  penalites_retard: string;
  indemnite_recouvrement: string;
  profile_slug: string | null;
  profile_display_name: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Espace client
// ---------------------------------------------------------------------------

export type MissionTemplateMode = "freelance" | "salarie";

export interface MissionTemplate {
  id: number;
  name: string;
  establishment: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  instructions: string;
  establishment_address_line1: string;
  establishment_address_line2: string;
  establishment_postal_code: string;
  establishment_city: string;
  establishment_country: string;
  mode: MissionTemplateMode;
  created_at: string;
  updated_at: string;
}

export interface ClientContactProfile {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  job_title: string;
  location: string;
  bio: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  email: string;
}

export interface ClientContact {
  id: number;
  profile: ClientContactProfile;
  created_at: string;
}

export interface ClientDashboardResponse {
  profile: FreelancerProfile;
  contacts: ClientContact[];
  templates: MissionTemplate[];
  missions: Mission[];
  factures: Facture[];
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminOverviewSummary {
  total_accounts: number;
  freelance_accounts: number;
  client_accounts: number;
  admin_accounts: number;
  total_skills: number;
  total_slots: number;
  total_unavailabilities: number;
  total_missions: number;
}

export interface AdminAccountSummary {
  id: number;
  slug: string | null;
  display_name: string;
  avatar_url: string | null;
  role: AccountRole;
  auth_provider: string;
  job_title: string;
  location: string;
  email: string;
  skill_count: number;
  slot_count: number;
  mission_count: number;
  unavailability_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminAccountDetail {
  id: number;
  slug: string | null;
  display_name: string;
  avatar_url: string | null;
  role: AccountRole;
  auth_provider: string;
  google_sub: string | null;
  oidc_sub: string | null;
  job_title: string;
  location: string;
  bio: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  legal_status: string;
  vat_number: string;
  vat_notice: string;
  iban: string;
  bic: string;
  hourly_rate: string | null;
  currency: string;
  payment_terms: string;
  late_penalties: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface AdminAccountStats {
  skill_count: number;
  slot_count: number;
  mission_count: number;
  unavailability_count: number;
}

export interface AdminOverviewResponse {
  summary: AdminOverviewSummary;
  accounts: AdminAccountSummary[];
  filters: {
    q: string;
    role: AccountRole | null;
  };
}

export interface AdminAccountDetailResponse {
  account: AdminAccountDetail;
  stats: AdminAccountStats;
  skills: Skill[];
  slots: Slot[];
  missions: Mission[];
  unavailabilities: Unavailability[];
}

// ---------------------------------------------------------------------------
// Resto — restaurants, équipes, shifts
// ---------------------------------------------------------------------------

export type RestaurantPosition =
  | "serveur" | "chef_de_rang" | "barman" | "sommelier" | "hote_accueil"
  | "chef_cuisine" | "cuisinier" | "plongeur" | "manager" | "autre";

export type ShiftService = "midi" | "soir" | "journee" | "autre";
export type ShiftStatus = "draft" | "published";
export type AvailabilityStatus = "available" | "unavailable" | "maybe";
export type AssignmentStatus = "proposed" | "confirmed" | "declined";

export interface Restaurant {
  id: number;
  slug: string;
  name: string;
  description: string;
  address: string;
  city: string;
  cuisine_type: string;
  logo_url: string;
  cover_url: string;
  member_count: number;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
  // injected client-side by restaurant_detail
  is_manager?: boolean;
  my_member_id?: number | null;
}

export interface RestaurantMember {
  id: number;
  name: string;
  position: RestaurantPosition;
  is_active: boolean;
  is_manager: boolean;
  email: string;
  joined_at: string;
  avatar_url: string | null;
  extra_slug: string | null;
}

export interface ShiftAvailability {
  id: number;
  member_id: number;
  member_name: string;
  status: AvailabilityStatus;
  note: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: number;
  member_id: number;
  member_name: string;
  member_position: RestaurantPosition;
  avatar_url: string | null;
  status: AssignmentStatus;
  note: string;
  created_at: string;
}

export interface RestaurantShift {
  id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  service: ShiftService;
  positions_needed: number;
  position: RestaurantPosition;
  notes: string;
  status: ShiftStatus;
  created_at: string;
  updated_at: string;
  availabilities: ShiftAvailability[];
  assignments: ShiftAssignment[];
  assigned_count: number;
  available_count: number;
}
