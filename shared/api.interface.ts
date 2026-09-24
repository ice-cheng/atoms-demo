export type AppStyle = 'minimal' | 'dark' | 'gradient' | 'professional';
export type ProjectStatus = 'building' | 'completed' | 'failed';
export type FontStyle = 'modern' | 'serif' | 'handwriting' | 'monospace';

export interface BrandKit {
  enabled: boolean;
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  fontStyle: FontStyle;
}

export interface AgentLogEntry {
  agent: 'pm' | 'architect' | 'engineer' | 'reviewer' | 'fixer';
  agentName: string;
  message: string;
  timestamp: string;
}

export interface ProjectVersion {
  id: string;
  html: string;
  description: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  style: AppStyle;
  status: ProjectStatus;
  generatedHtml: string;
  agentLogs: AgentLogEntry[];
  versions: ProjectVersion[];
  shareToken: string | null;
  isPublic: boolean;
  raceMode: boolean;
  raceHtmlA: string;
  raceHtmlB: string;
  raceWinner: string;
  fixerRounds: number;
  finalScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  credits: number;
  brandKit: BrandKit;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateProjectRequest {
  name?: string;
  description: string;
  style: AppStyle;
  raceMode?: boolean;
}

export interface RebuildProjectRequest {
  description?: string;
  iteration?: boolean;
  versionId?: string;
}

export interface DebugFixRequest {
  html: string;
  errors: string;
}

export interface ProjectListResponse {
  items: Project[];
  total: number;
}

export interface UpdateUserRequest {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface RechargeRecord {
  credits: number;
  amount: number;
  packageKey: string;
  createdAt: string;
}

export interface RechargeRequest {
  packageKey: string;
}

export interface RechargeResponse {
  credits: number;
  added: number;
  record: RechargeRecord;
}

export interface ShareProjectResponse {
  shareToken: string;
  shareUrl: string;
  isPublic: boolean;
}

export interface SharedProjectResponse {
  name: string;
  description: string;
  generatedHtml: string;
  style: AppStyle;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  completed: number;
  building: number;
  credits: number;
  lastActivity: string | null;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  previewDescription: string;
}
