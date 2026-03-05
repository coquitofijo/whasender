export interface Session {
  id: string;
  name: string;
  phone: string | null;
  proxy_url: string | null;
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'logged_out' | 'banned';
  created_at: string;
  updated_at: string;
}

export interface ContactList {
  id: string;
  name: string;
  total_count: number;
  created_at: string;
}

export interface Contact {
  id: string;
  phone: string;
  name: string;
  custom_fields: Record<string, string>;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  session_id: string;
  list_id: string;
  message_template: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  delay_min_ms: number;
  delay_max_ms: number;
  contact_limit: number;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  session_name: string;
  session_phone: string;
  session_status: string;
  list_name: string;
}

export interface MessageLog {
  id: string;
  contact_phone: string;
  contact_name: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  wa_message_id: string | null;
  sent_at: string;
}

export interface DashboardStats {
  sessions: { total: string; connected: string };
  campaigns: { total: string; running: string; completed: string };
  messagesToday: { total: string; sent: string; failed: string };
}

export interface AutopilotConfig {
  id: string;
  message_templates: string[];
  messages_per_cycle: number;
  cycle_interval_hours: number;
  delay_between_ms: number;
  status: 'stopped' | 'running';
  last_cycle_at: string | null;
  next_cycle_at: string | null;
}

export interface AutopilotAssignment {
  session_id: string;
  list_id: string;
  session_name: string;
  list_name: string;
}

export interface BanAlert {
  id: string;
  session_id: string;
  session_name: string;
  phone: string | null;
  reason: 'banned' | 'temp_banned';
  status_code: number;
  dismissed: boolean;
  created_at: string;
}
