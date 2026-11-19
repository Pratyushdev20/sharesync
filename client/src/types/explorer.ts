export interface FolderItem {
  id: string;
  name: string;
  owner_firebase_uid?: string | null;
  parent_folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
  subfolders?: FolderItem[];
  files?: FileItem[];
  /** Caller's access level (returned by GET /api/folders/:id) */
  access?: 'owner' | 'editor' | 'viewer';
}

export interface FileItem {
  id: string;
  name: string;
  size: number | string;
  mime_type: string;
  folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Caller's access level (returned by GET /api/files/:id) */
  access?: 'owner' | 'editor' | 'viewer';
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export type ViewMode = 'grid' | 'list';

export type SortField = 'name' | 'size' | 'updated_at';

export type SortDirection = 'asc' | 'desc';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  /** Machine-readable error code, e.g. PASSWORD_REQUIRED */
  code?: string;
  data?: T;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export type AccessLevel = 'owner' | 'editor' | 'viewer';
export type SharePermission = 'viewer' | 'editor';
export type ResourceType = 'file' | 'folder';

export interface SharedWithMeFile {
  share_id: string;
  permission: SharePermission;
  shared_at: string;
  file_id: string;
  name: string;
  size: number | string;
  mime_type: string;
  created_at?: string;
  updated_at?: string;
  owner_name: string;
  owner_email: string;
}

export interface SharedWithMeFolder {
  share_id: string;
  permission: SharePermission;
  shared_at: string;
  folder_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  owner_name: string;
  owner_email: string;
}

export interface SharedWithMe {
  files: SharedWithMeFile[];
  folders: SharedWithMeFolder[];
}

export interface SharePerson {
  share_id: string;
  permission: SharePermission;
  shared_at: string;
  name: string;
  email: string | null;
}

export interface ShareLinkSummary {
  link_id: string;
  permission: SharePermission;
  is_anonymous_allowed: boolean;
  expires_at: string | null;
  is_active: boolean;
  is_expired: boolean;
  has_password: boolean;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
}

export interface ResourceAccess {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  people: SharePerson[];
  links: ShareLinkSummary[];
}

export interface CreatedShareLink {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  permission: SharePermission;
  isAnonymousAllowed: boolean;
  expiresAt: string | null;
  hasPassword: boolean;
  token: string;
  path: string;
}

export interface PublicLinkInfo {
  linkId: string;
  resourceType: ResourceType;
  resource: { id: string; name: string; size?: number | string; mime_type?: string; created_at?: string; updated_at?: string };
  permission: SharePermission;
  isAnonymousAllowed: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  sharedBy: string | null;
}

export interface PublicLinkContents {
  folder: { id: string; name: string; parent_folder_id: string | null; is_link_root: boolean };
  subfolders: { id: string; name: string; created_at?: string; updated_at?: string }[];
  files: { id: string; name: string; size: number | string; mime_type: string; created_at?: string; updated_at?: string }[];
}
