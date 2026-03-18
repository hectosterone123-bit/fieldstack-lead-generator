export type ServiceType =
  | 'hvac' | 'plumbing' | 'electrical'
  | 'roofing' | 'landscaping' | 'pest_control' | 'general';

export type LeadStatus =
  | 'new' | 'contacted' | 'qualified'
  | 'proposal_sent' | 'booked' | 'lost' | 'closed_won';

export type ActivityType =
  | 'status_change' | 'note' | 'call_attempt'
  | 'email_sent' | 'email_opened' | 'sms_sent' | 'heat_update' | 'import' | 'enrichment';

export type TemplateChannel = 'email' | 'sms' | 'call_script' | 'loom_script';

export interface Template {
  id: number;
  name: string;
  channel: TemplateChannel;
  status_stage: LeadStatus;
  step_order: number;
  subject: string | null;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplatePreview extends Template {
  rendered_subject: string | null;
  rendered_body: string;
}

export interface TemplateVariable {
  variable: string;
  description: string;
  fallback: string;
}

export interface ScheduledEmail {
  id: number;
  lead_id: number;
  template_id: number;
  template_name: string;
  template_subject: string | null;
  scheduled_at: string;
  created_at: string;
}

export interface Lead {
  id: number;
  business_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  service_type: ServiceType;
  status: LeadStatus;
  heat_score: number;
  estimated_value: number;
  website: string | null;
  has_website: 0 | 1;
  website_live: 0 | 1;
  google_maps_url: string | null;
  source: 'manual' | 'osm_finder' | 'csv_import' | 'google_places';
  osm_id: string | null;
  osm_type: string | null;
  google_place_id: string | null;
  rating: number | null;
  review_count: number | null;
  contact_count: number;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  tags: string | null;
  notes: string | null;
  enrichment_data: string | null;
  enriched_at: string | null;
  proposal_amount: number | null;
  proposal_date: string | null;
  close_date: string | null;
  won_amount: number | null;
  lost_reason: string | null;
  loom_url: string | null;
  ghost_time: string | null;
  test_submitted_at: string | null;
  test_responded_at: string | null;
  email_opened_at: string | null;
  unsubscribed_at: string | null;
  first_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrichmentData {
  emails: string[];
  team_names: string[];
  services: string[];
  tech_stack: string;
  scraped_at: string;
  error?: string;
}

export interface Activity {
  id: number;
  lead_id: number;
  type: ActivityType;
  title: string;
  description: string | null;
  metadata: string | null;
  created_at: string;
  business_name?: string;
}

export interface FinderResult {
  osm_id: string | null;
  osm_type: string | null;
  google_place_id: string | null;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  service_type: ServiceType;
  has_website: boolean;
  website_live: boolean;
  google_maps_url: string | null;
  heat_score: number;
  prospect_score: number;
  already_imported: boolean;
  rating: number | null;
  review_count: number | null;
  source: string;
}

export interface ImportOptions {
  auto_enrich?: boolean;
  auto_enroll?: boolean;
  sequence_id?: number;
}

export interface BatchSearchParams {
  service_type: string;
  cities: Array<{ city: string; state: string }>;
  radius_km?: number;
  source?: 'google' | 'osm' | 'both';
  country?: string;
}

export interface BatchSearchMeta {
  city_log: Array<{ city: string; state: string; found: number; error?: string }>;
  total: number;
  new: number;
}

export interface Stats {
  total_leads: number;
  by_status: { status: LeadStatus; count: number }[];
  by_service_type: { service_type: ServiceType; count: number }[];
  pipeline_value: number;
  hot_leads_count: number;
  booked_count: number;
  conversion_rate: number;
  contacted_this_week: number;
  recent_activities: (Activity & { business_name: string })[];
  leads_found_this_week: number;
  enrichment_rate: number;
  outreach_coverage: number;
  avg_untouched_age_days: number | null;
  avg_speed_to_lead_minutes: number | null;
  best_speed_to_lead_minutes: number | null;
  speed_to_lead_sample: number;
  total_won_revenue: number;
  avg_deal_size: number;
  deals_closed_this_month: number;
  revenue_this_month: number;
  proposals_open_count: number;
  proposals_open_value: number;
  ghost_count: number;
  ghost_leads: Array<{
    id: number;
    business_name: string;
    last_contacted_at: string;
    status: LeadStatus;
    phone: string | null;
    service_type: ServiceType;
  }>;
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  booked: 'Booked',
  lost: 'Lost',
  closed_won: 'Closed Won',
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-zinc-700 text-zinc-200',
  contacted: 'bg-blue-900 text-blue-200',
  qualified: 'bg-purple-900 text-purple-200',
  proposal_sent: 'bg-yellow-900 text-yellow-200',
  booked: 'bg-green-900 text-green-200',
  lost: 'bg-red-900 text-red-300',
  closed_won: 'bg-emerald-900 text-emerald-200',
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  roofing: 'Roofing',
  landscaping: 'Landscaping',
  pest_control: 'Pest Control',
  general: 'General',
};

export const PREDEFINED_TAGS = ['priority', 'referral', 'cold', 'hot', 'callback'] as const;

export const TAG_COLORS: Record<string, string> = {
  priority: 'bg-orange-900 text-orange-200',
  referral: 'bg-blue-900 text-blue-200',
  cold: 'bg-cyan-900 text-cyan-200',
  hot: 'bg-red-900 text-red-200',
  callback: 'bg-yellow-900 text-yellow-200',
};

export const TAG_COLOR_DEFAULT = 'bg-zinc-700 text-zinc-300';

export const SERVICE_COLORS: Record<ServiceType, string> = {
  hvac: 'bg-orange-900 text-orange-200',
  plumbing: 'bg-cyan-900 text-cyan-200',
  electrical: 'bg-yellow-900 text-yellow-200',
  roofing: 'bg-stone-700 text-stone-200',
  landscaping: 'bg-green-900 text-green-200',
  pest_control: 'bg-red-900 text-red-200',
  general: 'bg-zinc-700 text-zinc-300',
};

// ─── Chat / Copilot ─────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  title: string;
  context: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  tool_name: string | null;
  created_at: string;
}

export interface CopilotContext {
  page: string;
  lead_id?: number;
  lead_name?: string;
}

// ─── Sequences ───────────────────────────────────────────────────────────────

export interface SequenceStep {
  order: number;
  delay_days: number;
  channel: TemplateChannel;
  template_id: number;
  label: string;
}

export interface Sequence {
  id: number;
  name: string;
  description: string | null;
  steps: SequenceStep[];
  is_active: number;
  auto_send: number;
  active_enrollments?: number;
  emails_sent?: number;
  emails_opened?: number;
  created_at: string;
  updated_at: string;
}

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface LeadSequenceEnrollment {
  id: number;
  lead_id: number;
  sequence_id: number;
  current_step: number;
  status: EnrollmentStatus;
  enrolled_at: string;
  paused_at: string | null;
  completed_at: string | null;
  sequence_name: string;
  steps: SequenceStep[];
  created_at: string;
  updated_at: string;
}

export interface OutreachQueueItem {
  enrollment_id: number;
  lead_id: number;
  sequence_id: number;
  sequence_name: string;
  business_name: string;
  first_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  current_step: number;
  total_steps: number;
  step_label: string;
  channel: TemplateChannel;
  template_id: number;
  template_name: string;
  rendered_subject: string;
  rendered_body: string;
  due_date: string;
  is_overdue: boolean;
  enrolled_at: string;
  email_opened_at: string | null;
}

export interface QueueStats {
  overdue: number;
  due_today: number;
  upcoming: number;
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export interface SmsMessage {
  id: number;
  lead_id: number | null;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  body: string;
  twilio_sid: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  business_name?: string;
  first_name?: string | null;
  lead_status?: string;
}

export interface SmsThread {
  lead_id: number;
  business_name: string | null;
  first_name: string | null;
  phone: string | null;
  lead_status: string | null;
  service_type: string | null;
  message_count: number;
  inbound_count: number;
  outbound_count: number;
  last_message_at: string;
  last_message: string;
  last_direction: 'inbound' | 'outbound';
}

export interface MissedCallSettings {
  enabled: boolean;
  message: string;
  twilio_configured: boolean;
}

export interface ReviewRequestSettings {
  enabled: boolean;
  message: string;
  google_review_link: string;
  twilio_configured: boolean;
}
