export function formatFileSize(bytes: number | string | undefined): string {
  if (bytes === undefined || bytes === null) return '0 B';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  const formatted = (num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i]}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export interface FileTypeInfo {
  category: 'pdf' | 'image' | 'document' | 'archive' | 'audio' | 'video' | 'code' | 'other';
  label: string;
  color: string;
  iconSymbol: string;
}

export function getFileTypeInfo(fileName: string, mimeType?: string): FileTypeInfo {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      category: 'pdf',
      label: 'PDF Document',
      color: '#ef4444', // Red
      iconSymbol: 'doc.text.fill',
    };
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || mime.startsWith('image/')) {
    return {
      category: 'image',
      label: `${ext.toUpperCase()} Image`,
      color: '#10b981', // Emerald
      iconSymbol: 'photo.fill',
    };
  }

  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'].includes(ext) || mime.includes('officedocument') || mime.includes('word') || mime.includes('excel')) {
    return {
      category: 'document',
      label: `${ext.toUpperCase()} Document`,
      color: '#3b82f6', // Blue
      iconSymbol: 'doc.fill',
    };
  }

  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return {
      category: 'archive',
      label: `${ext.toUpperCase()} Archive`,
      color: '#64748b', // Slate
      iconSymbol: 'archivebox.fill',
    };
  }

  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) || mime.startsWith('audio/')) {
    return {
      category: 'audio',
      label: 'Audio File',
      color: '#8b5cf6', // Violet
      iconSymbol: 'music.note',
    };
  }

  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) || mime.startsWith('video/')) {
    return {
      category: 'video',
      label: 'Video File',
      color: '#ec4899', // Pink
      iconSymbol: 'play.rectangle.fill',
    };
  }

  if (['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'md', 'txt'].includes(ext) || mime.startsWith('text/')) {
    return {
      category: 'code',
      label: `${ext.toUpperCase() || 'Text'} File`,
      color: '#f59e0b', // Amber
      iconSymbol: 'chevron.left.forwardslash.chevron.right',
    };
  }

  return {
    category: 'other',
    label: ext ? `${ext.toUpperCase()} File` : 'File',
    color: '#94a3b8', // Gray
    iconSymbol: 'doc',
  };
}
