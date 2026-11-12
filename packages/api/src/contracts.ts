export const platformLabels = { web: 'Web', android: 'Android', ios: 'iOS' } as const;
export const projectStatusLabels = { dev: 'Em desenvolvimento', review: 'Em review', prod: 'Em produção' } as const;
export const ticketStatusLabels = { open: 'Aberto', working: 'Em andamento', fixed: 'Corrigido', unreproduced: 'Não reproduzido' } as const;
export const reportLabels = {
  title: 'Título', observed: 'O que aconteceu', expected: 'Resultado esperado',
  steps: 'Passos para reproduzir', environment: 'Ambiente de teste',
} as const;

export type Platform = keyof typeof platformLabels;
export type ProjectStatus = keyof typeof projectStatusLabels;
export type TicketStatus = keyof typeof ticketStatusLabels;
export type ReportField = keyof typeof reportLabels;
export type Report = Record<ReportField, string>;

export type User = {
  id: string;
  name: string;
  email: string;
  platforms: Platform[];
  announcement_emails: boolean;
  email_verified: boolean;
  android_test_email: string | null;
  android_test_email_public: boolean;
};

export type Session = {
  user: User | null;
  whatsappGroup: string | null;
  appOrigin: string | null;
  aiEnabled: boolean;
  emailAnnouncementsEnabled: boolean;
  directUploads: boolean;
  unreadNotifications: number;
};

export type AndroidTester = { id: string; name: string; email: string; shared: boolean };
export type AndroidTestersResponse = { testers: AndroidTester[]; sharedByMe: boolean };
export type Notification = { id: string; projectId: string; projectName: string; actorName: string; createdAt: string; read: boolean };

export function accountDestination(value: unknown) {
  return typeof value === 'string' && /^(?:\/\?meus|\/perfil|\/notificacoes|\/projetos\/[a-f0-9-]{36})$/.test(value)
    ? value : undefined;
}

export type Project = {
  id: string;
  name: string;
  platform: Platform;
  platforms: Platform[];
  description: string;
  url: string;
  instructions: string;
  status: ProjectStatus;
  requested_at: string | null;
  created_at: string;
  owner_id: string;
  owner: string;
  has_cover: boolean | number;
  review_count: number;
  pending_retests?: number;
};

export type Review = { id: string; author: string; feedback: string; created_at: string };
export type Attachment = { id: string; name: string; type: string };
export type Suggestion = { title: string; summary: string; category: string; confidence: string };
export type TicketEvent = { status: TicketStatus | 'retest_requested' | 'retest_confirmed' | 'retest_reopened'; actor: string; created_at: string };
export type Ticket = Report & {
  id: string;
  status: TicketStatus;
  retest_request_id: string | null;
  has_evidence: boolean | number;
  review_id: string;
  reporter: string;
  created_at: string;
  triage_state: string | null;
  missing: ReportField[];
  suggestion: Suggestion | null;
  duplicate_id?: string | null;
  events: TicketEvent[];
  attachments: Attachment[];
};

export type AnnouncementSummary = {
  enabled: boolean; queued: number; accepted: number; failed: number; unknown: number; cancelled: number;
};
export type ProjectDetail = {
  project: Project;
  reviews: Review[];
  tickets: Ticket[];
  myReview: { feedback: string } | null;
  emailAnnouncement: AnnouncementSummary | null;
};
