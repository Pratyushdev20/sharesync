export interface FolderItem {
  id: string;
  name: string;
  owner_firebase_uid?: string | null;
  parent_folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
  subfolders?: FolderItem[];
  files?: FileItem[];
}

export interface FileItem {
  id: string;
  name: string;
  size: number | string;
  mime_type: string;
  folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
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
  data?: T;
}
