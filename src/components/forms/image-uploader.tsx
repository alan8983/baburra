'use client';

// 圖片上傳元件

import { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Plus, X, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadImages } from '@/hooks/use-upload';
import { Label } from '@/components/ui/label';

export interface ImageUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  className?: string;
  disabled?: boolean;
}

export function ImageUploader({
  value = [],
  onChange,
  maxImages = 10,
  className,
  disabled = false,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { uploadMultiple, isUploading, progress } = useUploadImages({
    onError: (error) => {
      setUploadError(error.message);
      setTimeout(() => setUploadError(null), 3000);
    },
  });

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // 檢查數量限制
      const remainingSlots = maxImages - value.length;
      if (files.length > remainingSlots) {
        setUploadError(`最多只能上傳 ${maxImages} 張圖片`);
        setTimeout(() => setUploadError(null), 3000);
        return;
      }

      setUploadError(null);
      const results = await uploadMultiple(files);

      if (results.length > 0) {
        const newUrls = results.map((r) => r.url);
        onChange([...value, ...newUrls]);
      }

      // 清除 input 讓同一檔案可以再次上傳
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [maxImages, onChange, uploadMultiple, value]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const newUrls = value.filter((_, i) => i !== index);
      onChange(newUrls);
    },
    [onChange, value]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading && value.length < maxImages) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading, maxImages, value.length]);

  const canAddMore = value.length < maxImages && !disabled && !isUploading;

  return (
    <div className={cn('space-y-2', className)}>
      <Label>圖片</Label>

      <div className="flex flex-wrap gap-2">
        {/* 已上傳的圖片 */}
        {value.map((url, index) => (
          <div
            key={url}
            className="bg-muted group relative h-20 w-20 overflow-hidden rounded-lg border"
          >
            <Image
              src={url}
              alt={`Uploaded image ${index + 1}`}
              fill
              className="object-cover"
              sizes="80px"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="移除圖片"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {/* 上傳中顯示 */}
        {isUploading && (
          <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-lg border">
            <div className="flex flex-col items-center gap-1">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              <span className="text-muted-foreground text-xs">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* 新增按鈕 */}
        {canAddMore && (
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-lg border border-dashed transition-colors',
              'hover:bg-muted/50 cursor-pointer',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            disabled={disabled}
          >
            <Plus className="text-muted-foreground h-6 w-6" />
          </button>
        )}

        {/* 隱藏的 file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />
      </div>

      {/* 錯誤訊息 */}
      {uploadError && (
        <div className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 提示文字 */}
      <p className="text-muted-foreground text-xs">
        點擊上傳圖片，最多 {maxImages} 張（支援 JPG、PNG、GIF、WebP，每張最大 5MB）
      </p>
    </div>
  );
}
