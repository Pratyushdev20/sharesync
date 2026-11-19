import { Platform } from 'react-native';
import { auth } from '@/config/firebase';
import { ApiResponse, UploadProgress } from '@/types/explorer';

export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:2000';
  }
  return 'http://localhost:2000';
}

/**
 * Retrieves the current Firebase ID token.
 */
export async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User is not authenticated. Please log in.');
  }
  const token = await currentUser.getIdToken();
  if (!token) {
    throw new Error('Failed to retrieve authentication token.');
  }
  return token;
}

/**
 * Standard HTTP request wrapper with Bearer token authentication.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getAuthToken();
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  };

  // Only set application/json if body is not FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch {
    data = {
      success: response.ok,
      message: response.statusText || 'Unexpected server response',
    };
  }

  if (!response.ok) {
    const errorMsg = data.message || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * Multipart file upload using XMLHttpRequest for genuine upload progress tracking.
 */
export function uploadFileWithProgress(
  endpoint: string,
  formData: FormData,
  onProgress?: (progress: UploadProgress) => void
): Promise<ApiResponse<any>> {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getAuthToken();
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
            });
          }
        };
      }

      xhr.onload = () => {
        let responseJson: ApiResponse<any>;
        try {
          responseJson = JSON.parse(xhr.responseText);
        } catch {
          responseJson = {
            success: xhr.status >= 200 && xhr.status < 300,
            message: xhr.statusText,
          };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseJson);
        } else {
          const errorMsg = responseJson.message || `Upload failed with status ${xhr.status}`;
          const err = new Error(errorMsg) as Error & { status?: number };
          err.status = xhr.status;
          reject(err);
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during file upload.'));
      };

      xhr.send(formData);
    } catch (err) {
      reject(err);
    }
  });
}
