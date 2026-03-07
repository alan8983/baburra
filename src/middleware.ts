// Next.js Middleware
// 處理認證狀態和路由保護

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// 不需要認證的公開路由（不含 / — 首頁有特殊處理）
const publicRoutes = [
  '/login',
  '/register',
  '/auth/callback',
  '/reset-password',
  '/reset-password/confirm',
  '/welcome',
];

// API 路由（部分需要認證）
const publicApiRoutes = ['/api/auth', '/api/health'];

// 匿名用戶允許存取的路由
const anonymousAllowedRoutes = ['/welcome'];
const anonymousAllowedApiPrefixes = ['/api/import/batch', '/api/fetch-url', '/api/ai/'];

// 檢查 Supabase 是否正確配置（非占位符）
const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳過靜態檔案和公開路由
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    publicRoutes.includes(pathname)
  ) {
    return NextResponse.next();
  }

  // 跳過公開 API 路由
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // 首頁快速路徑：無 auth cookie 時直接顯示 landing page
  if (pathname === '/') {
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
    if (!hasAuthCookie) {
      return NextResponse.next();
    }
  }

  // 如果有 DEV_USER_ID 或 TEST_USER_ID，直接允許存取（僅限非 production 環境）
  if (process.env.NODE_ENV !== 'production') {
    const hasTestUser = !!(process.env.DEV_USER_ID || process.env.TEST_USER_ID);
    if (hasTestUser) {
      return NextResponse.next();
    }
  }

  // 如果 Supabase 未正確配置，跳過認證（避免錯誤）
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  // 建立 Supabase client
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 嘗試取得使用者資訊
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 首頁：已登入用戶重導向到 /input，未登入用戶顯示 landing page
  if (pathname === '/') {
    if (user && !user.is_anonymous) {
      return NextResponse.redirect(new URL('/input', request.url));
    }
    return response;
  }

  // 如果未登入
  if (!user) {
    // API 路由返回 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 頁面路由重導向到登入頁
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 匿名用戶限制 ──
  const isAnonymous = user.is_anonymous === true;

  if (isAnonymous) {
    const isAllowedRoute = anonymousAllowedRoutes.some((route) => pathname === route);
    const isAllowedApi = anonymousAllowedApiPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!isAllowedRoute && !isAllowedApi) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Please complete registration' }, { status: 403 });
      }
      // 重導向匿名用戶回 /welcome
      return NextResponse.redirect(new URL('/welcome', request.url));
    }
  }

  // 如果已登入（非匿名）但訪問登入/註冊頁，重導向到快速輸入
  if (!isAnonymous && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/input', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
