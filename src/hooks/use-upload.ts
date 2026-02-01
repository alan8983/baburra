'use client';

// 圖片上傳 Hook

import { useState, useCallback } from 'react';

interface UploadResult {
  url: string;
  path: string;
}

interface UseUploadOptions {
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

export function useUploadImage(options?: UseUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        // 模擬進度（實際 fetch 不支援進度追蹤）
        setProgress(30);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        setProgress(80);

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const result: UploadResult = await res.json();
        setProgress(100);
        options?.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Upload failed');
        setError(error);
        options?.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [options]
  );

  const deleteImage = useCallback(async (path: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/upload?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      return true;
    } catch (err) {
      console.error('Delete error:', err);
      return false;
    }
  }, []);

  return {
    upload,
    deleteImage,
    isUploading,
    progress,
    error,
  };
}

// 批量上傳
export function useUploadImages(options?: UseUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [errors, setErrors] = useState<Error[]>([]);

  const uploadMultiple = useCallback(
    async (files: File[]): Promise<UploadResult[]> => {
      setIsUploading(true);
      setUploadedCount(0);
      setTotalCount(files.length);
      setErrors([]);

      const results: UploadResult[] = [];

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upload failed');
          }

          const result: UploadResult = await res.json();
          results.push(result);
          options?.onSuccess?.(result);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Upload failed');
          setErrors((prev) => [...prev, error]);
          options?.onError?.(error);
        }

        setUploadedCount((prev) => prev + 1);
      }

      setIsUploading(false);
      return results;
    },
    [options]
  );

  return {
    uploadMultiple,
    isUploading,
    uploadedCount,
    totalCount,
    progress: totalCount > 0 ? (uploadedCount / totalCount) * 100 : 0,
    errors,
  };
}
