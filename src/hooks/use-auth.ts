'use client';

/**
 * Auth Hook - 用於客戶端認證狀態管理
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/infrastructure/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { ROUTES } from '@/lib/constants';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: AuthError | null;
}

export interface UseAuthReturn extends AuthState {
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // 穩定參考，避免每次 render 建立新 client 導致 useEffect 無限重跑
  const supabase = useMemo(() => createClient(), []);

  // router 用 ref 持有，避免 useRouter() 每次 render 新參考導致 effect 無限重跑（嚴重時會 crash）
  const routerRef = useRef(router);
  routerRef.current = router;

  // 初始化 - 取得當前 session（含逾時，避免未設定 Supabase 時卡住）
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SESSION_TIMEOUT')), 5000)
        );

        const {
          data: { session },
          error,
        } = await Promise.race([sessionPromise, timeoutPromise]);

        if (cancelled) return;
        if (error) throw error;

        setState({
          user: session?.user ?? null,
          session,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (error as Error).message === 'SESSION_TIMEOUT' ? null : (error as AuthError),
        }));
      }
    };

    initAuth();

    // 監聽 auth 狀態變化（使用 routerRef 避免 router 進 dependency 造成無限循環）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        error: null,
      });

      if (event === 'SIGNED_OUT') {
        routerRef.current.push(ROUTES.LOGIN);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // 註冊
  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
            emailRedirectTo: `${window.location.origin}${ROUTES.AUTH_CALLBACK}`,
          },
        });

        if (error) throw error;

        setState({
          user: data.user,
          session: data.session,
          loading: false,
          error: null,
        });

        // 如果需要 email 驗證
        if (data.user && !data.session) {
          router.push(`${ROUTES.LOGIN}?message=請檢查您的電子郵件以完成註冊`);
        } else {
          router.push(ROUTES.INPUT);
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as AuthError,
        }));
        throw error;
      }
    },
    [supabase, router]
  );

  // 登入
  const signIn = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setState({
          user: data.user,
          session: data.session,
          loading: false,
          error: null,
        });

        router.push(ROUTES.INPUT);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as AuthError,
        }));
        throw error;
      }
    },
    [supabase, router]
  );

  // Google OAuth 登入
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${ROUTES.AUTH_CALLBACK}`,
      },
    });

    if (error) {
      setState((prev) => ({
        ...prev,
        error: error as AuthError,
      }));
      throw error;
    }
  }, [supabase]);

  // 登出
  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setState({
        user: null,
        session: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error as AuthError,
      }));
      throw error;
    }
  }, [supabase]);

  // 重設密碼
  const resetPassword = useCallback(
    async (email: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${ROUTES.AUTH_CALLBACK}?next=${ROUTES.RESET_PASSWORD_CONFIRM}`,
        });

        if (error) throw error;

        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as AuthError,
        }));
        throw error;
      }
    },
    [supabase]
  );

  // 更新密碼
  const updatePassword = useCallback(
    async (newPassword: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) throw error;

        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as AuthError,
        }));
        throw error;
      }
    },
    [supabase]
  );

  return {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
  };
}

// 取得當前用戶 ID (不需要完整 auth state 時使用)
export function useUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}
