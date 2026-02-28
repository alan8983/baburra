// 圖片上傳 API - 使用 Supabase Storage

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUserId } from '@/infrastructure/supabase';
import {
  unauthorizedError,
  badRequestError,
  forbiddenError,
  internalError,
  errorResponse,
} from '@/lib/api/error';

const BUCKET_NAME = 'images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return badRequestError('No file provided');
    }

    // 驗證檔案類型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequestError(`Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }

    // 驗證檔案大小
    if (file.size > MAX_FILE_SIZE) {
      return badRequestError(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // 生成唯一檔名
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `${userId}/${timestamp}-${randomId}.${ext}`;

    // 上傳到 Supabase Storage
    const supabase = await createServerSupabaseClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return errorResponse(500, 'UPLOAD_FAILED', 'Upload failed');
    }

    // 取得公開 URL
    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: data.path,
    });
  } catch (error) {
    return internalError(error, 'Upload failed');
  }
}

// 刪除圖片
export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return badRequestError('No path provided');
    }

    const normalizedPath = path
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/');

    // 確認是用戶自己的檔案，且禁止路徑跳脫
    if (
      normalizedPath.includes('..') ||
      normalizedPath.includes('\\') ||
      !normalizedPath.startsWith(`${userId}/`)
    ) {
      return forbiddenError();
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([normalizedPath]);

    if (error) {
      return errorResponse(500, 'DELETE_FAILED', 'Delete failed');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error, 'Delete failed');
  }
}
