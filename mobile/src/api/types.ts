/** Domain types. REST field names (snake_case) are kept as the API documents them. */

export type Role = 'student' | 'company_supervisor' | 'academic_supervisor' | 'coordinator';
export type EntryStatus = 'pending' | 'approved' | 'rejected';
export type PlacementStatus = 'open' | 'closed';
export type Decision = 'approved' | 'rejected';

export const ROLES: Role[] = ['student', 'company_supervisor', 'academic_supervisor', 'coordinator'];

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface Placement {
  id: string;
  school_id: string;
  company_id: string;
  student_id: string;
  student_name: string;
  company_name: string;
  company_city: string;
  /** Null until the invited company supervisor has created an account. */
  company_supervisor_id: string | null;
  company_supervisor_name: string | null;
  company_supervisor_email: string;
  academic_supervisor_id: string;
  academic_supervisor_name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  total_weeks: number;
  status: PlacementStatus;
  final_score: number | null;
  final_comment: string | null;
}

/** The coordinator picks the student and academic supervisor from the school's members. */
export interface PlacementInput {
  school_id?: string;
  student_id: string;
  academic_supervisor_id: string;
  company_name: string;
  company_city: string;
  company_supervisor_email: string;
  start_date: string;
  end_date: string;
}

export interface Entry {
  id: string;
  placement_id: string;
  student_id: string;
  week: number;
  tasks: string;
  hours: number;
  status: EntryStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Review {
  id: string;
  entry_id: string;
  reviewer_id: string;
  decision: Decision;
  comment: string | null;
  created_at: string;
}

export interface ProgressComment {
  week: number;
  decision: string;
  comment: string;
  reviewer_id: string;
}

export interface Progress {
  placement_id: string;
  total_weeks: number;
  submitted: number;
  approved: number;
  pending: number;
  rejected: number;
  completion_percent: number;
  comments: ProgressComment[];
}

export interface Membership {
  id: string;
  role: Role;
  school_id: string | null;
  school_name: string | null;
  company_id: string | null;
  company_name: string | null;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  memberships: Membership[];
}

export interface LoginResult {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: Me;
}

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: Role;
}

export interface InviteInfo {
  code: string;
  email: string;
  role: Role;
  expires_at: string;
  accepted_at: string | null;
}

export interface SchoolInfo {
  id: string;
  name: string;
  city: string;
  join_code: string;
  term_start: string;
  term_end: string;
}

export interface SchoolDetail {
  school: SchoolInfo;
  members: Member[];
  invites: InviteInfo[];
}

export interface Grant {
  status: 'member' | 'invited';
  email: string;
  invite: InviteInfo | null;
  email_sent: boolean;
}

/** What is stored on the phone. `activeId` is the membership (role in a school or company) in use. */
export interface Session {
  token: string;
  user: Me;
  activeId: string | null;
  /** Epoch milliseconds when the token stops being valid. */
  expiresAt: number;
}
