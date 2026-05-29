'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Prism from '@/components/Prism';

function LoginCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setError('Token not found');
      if (window.opener) {
        window.opener.postMessage({ type: 'DISCORD_LOGIN_ERROR', error: 'Token not found' }, '*');
      }
      return;
    }

    signInWithCustomToken(auth, token)
      .then(() => {
        console.log('✅ Firebase sign in successful');
        setStatus('success');

        if (window.opener) {
          window.opener.postMessage({ type: 'DISCORD_LOGIN_SUCCESS' }, '*');
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          setTimeout(() => {
            router.push('/');
          }, 1500);
        }
      })
      .catch((err) => {
        console.error('❌ Firebase sign in error:', err);
        setStatus('error');
        setError(err.message);
        if (window.opener) {
          window.opener.postMessage({ type: 'DISCORD_LOGIN_ERROR', error: err.message }, '*');
        }
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] relative overflow-hidden">
      {/* Prism Animated Background */}
      <div className="fixed inset-0 z-0">
        <Prism
          animationType="rotate"
          timeScale={0.5}
          height={3.5}
          baseWidth={5.5}
          scale={3.6}
          hueShift={0}
          colorFrequency={1}
          noise={0}
          glow={1}
        />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md animate-fadeIn">
          {/* Status Card - Glassmorphism with gradient border */}
          <div className="card-surface p-8 sm:p-10 relative overflow-hidden text-center">
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-2xl pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/30 via-blue-500/10 to-transparent rounded-2xl" />
              <div className="absolute inset-[1px] bg-[#121212] rounded-2xl" />
            </div>

            {/* Logo */}
            <div className="relative z-10 text-center mb-8">
              <h1 className="text-5xl font-bold text-white tracking-tight">
                narze
              </h1>
            </div>

            {/* Status Content */}
            <div className="relative z-10">
              {/* Loading State */}
              {status === 'loading' && (
                <div className="animate-fadeIn">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 border border-white/10">
                    <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                  </div>
                  <h2 className="text-lg font-medium text-white mb-2">กำลังเข้าสู่ระบบ...</h2>
                  <p className="text-slate-500 text-sm">กำลังเชื่อมต่อกับ Firebase</p>

                  {/* Progress dots */}
                  <div className="flex justify-center gap-1.5 mt-6">
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Success State */}
              {status === 'success' && (
                <div className="animate-fadeIn">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  </div>
                  <h2 className="text-lg font-medium text-white mb-2">เข้าสู่ระบบสำเร็จ!</h2>
                  <p className="text-green-400 text-sm mb-1">ยินดีต้อนรับกลับมา</p>
                  <p className="text-slate-500 text-xs">กำลังนำคุณไปยัง Dashboard...</p>

                  {/* Progress bar */}
                  <div className="mt-6 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                      style={{ animation: 'progress 1.5s ease-in-out forwards' }} />
                  </div>
                </div>
              )}

              {/* Error State */}
              {status === 'error' && (
                <div className="animate-fadeIn">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <h2 className="text-lg font-medium text-white mb-2">เกิดข้อผิดพลาด</h2>
                  <p className="text-red-400 text-sm mb-4">ไม่สามารถเข้าสู่ระบบได้</p>
                  {error && (
                    <p className="text-slate-500 text-xs mb-6 p-3 bg-white/5 rounded-lg border border-white/10">{error}</p>
                  )}
                  <button
                    onClick={() => router.push('/login')}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-6 py-3 text-white font-medium transition-all duration-300 hover:scale-[1.02]"
                  >
                    กลับไปหน้า Login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSS for progress animation */}
      <style jsx>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

export default function LoginCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0d0d] relative overflow-hidden">
        <div className="fixed inset-0 z-0">
          <Prism
            animationType="rotate"
            timeScale={0.5}
            height={3.5}
            baseWidth={5.5}
            scale={3.6}
            hueShift={0}
            colorFrequency={1}
            noise={0}
            glow={1}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        </div>
      </div>
    }>
      <LoginCallbackContent />
    </Suspense>
  );
}
