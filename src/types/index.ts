export type EmployeeKey = 'research' | 'sales' | 'copy' | 'website' | 'seo' | 'qa' | 'support' | 'human';
export type TaskStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'WAITING_FOR_CONFIGURATION' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ClientStatus = 'NEW' | 'RESEARCHING' | 'QUALIFIED' | 'CONTACTED' | 'MEETING' | 'PROPOSAL' | 'WON' | 'LOST';
export type ProjectStatus = 'PLANNING' | 'RESEARCH' | 'DESIGN' | 'DEVELOPMENT' | 'QA' | 'APPROVAL' | 'LIVE' | 'COMPLETED';

export interface EmployeeDefinition {
  key: Exclude<EmployeeKey, 'human'>;
  name: string;
  description: string;
  path: string;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  country: string;
  language: string;
  notes: string;
  leadScore: number | null;
  status: ClientStatus;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  description: string;
  status: ProjectStatus;
  deadline: string;
  createdAt: string;
}

export interface AgencyTask {
  id: string;
  title: string;
  description: string;
  employee: EmployeeKey;
  status: TaskStatus;
  priority: TaskPriority;
  clientId: string | null;
  projectId: string | null;
  workflowId: string | null;
  input: Record<string, unknown> | string;
  output: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Handoff {
  id: string;
  fromEmployee: EmployeeKey;
  toEmployee: EmployeeKey;
  taskId: string;
  projectId: string | null;
  clientId: string | null;
  summary: string;
  input: Record<string, unknown>;
  requiredOutput: string[];
  priority: TaskPriority;
  createdAt: string;
  fromTaskId: string;
  toTaskId: string;
  status?: 'blocked' | 'ready' | 'completed' | 'failed';
  workerOutput?: string | null;
}

export interface WorkflowRun {
  id: string;
  name: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  taskIds: string[];
  handoffIds: string[];
  clientId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  title: string;
  whatWillHappen: string;
  why: string;
  recommendation: string;
  preview: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  taskId?: string | null;
  workflowId?: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  entityId: string | null;
  createdAt: string;
}

export interface AgencyState {
  clients: Client[];
  projects: Project[];
  tasks: AgencyTask[];
  handoffs: Handoff[];
  workflows: WorkflowRun[];
  approvals: Approval[];
  activity: ActivityEvent[];
}