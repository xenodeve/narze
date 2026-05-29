'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { getDiscordAuthorizationUrl } from '@/lib/discord-auth';
import Prism from '@/components/Prism';

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // ตรวจสอบ error จาก Discord OAuth
        const discordError = searchParams.get('discord_error');
        if (discordError) {
            setError(decodeURIComponent(discordError));
        }
    }, [searchParams]);

    const handleDiscordLogin = async () => {
        try {
            setLoading(true);
            setError(null);
            const authUrl = getDiscordAuthorizationUrl();

            // Calculate popup window size and position (centered)
            const width = 500;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            // Open Discord OAuth in popup window
            const popup = window.open(
                authUrl,
                'Discord Login',
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );

            // Check if popup was blocked
            if (!popup) {
                setError('ไม่สามารถเปิด popup ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
                setLoading(false);
                return;
            }

            // Listen for message from popup (when login completes)
            const handleMessage = (event: MessageEvent) => {
                if (event.data?.type === 'DISCORD_LOGIN_SUCCESS') {
                    window.removeEventListener('message', handleMessage);
                    // Reload to trigger auth check
                    window.location.href = '/';
                } else if (event.data?.type === 'DISCORD_LOGIN_ERROR') {
                    window.removeEventListener('message', handleMessage);
                    setError(event.data.error || 'เข้าสู่ระบบล้มเหลว');
                    setLoading(false);
                }
            };

            window.addEventListener('message', handleMessage);

            // Check if popup is closed without completing login
            const checkPopupClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkPopupClosed);
                    window.removeEventListener('message', handleMessage);
                    setLoading(false);
                }
            }, 500);

        } catch (error: any) {
            console.error('Discord login error:', error);
            setError(error.message || 'เข้าสู่ระบบด้วย Discord ล้มเหลว');
            setLoading(false);
        }
    };

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
                {/* Dark overlay filter */}
                <div className="absolute inset-0 bg-black/60" />
            </div>

            {/* Content */}
            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                <div className="w-full max-w-md animate-fadeIn">
                    {/* Login Card - Glassmorphism with gradient border */}
                    <div className="card-surface p-8 sm:p-10 relative overflow-hidden">
                        {/* Gradient border effect - fades from top to bottom */}
                        <div className="absolute inset-0 rounded-2xl pointer-events-none">
                            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/30 via-blue-500/10 to-transparent rounded-2xl" />
                            <div className="absolute inset-[1px] bg-[#121212] rounded-2xl" />
                        </div>
                        {/* Logo - Large Italic Style */}
                        <div className="relative z-10 text-center mb-10">
                            <h1 className="text-5xl font-bold text-white tracking-tight">
                                narze
                            </h1>
                        </div>

                        {/* Content wrapper with z-index */}
                        <div className="relative z-10">

                            {/* Error Message */}
                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fadeIn text-center">
                                    {error}
                                </div>
                            )}

                            {/* Discord Login Button */}
                            <button
                                onClick={handleDiscordLogin}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-3 rounded-full bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 text-white font-medium transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-[#5865F2]/30 active:scale-[0.98]"
                            >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        กำลังเข้าสู่ระบบ...
                                    </span>
                                ) : (
                                    'Continue with Discord'
                                )}
                            </button>
                        </div>

                        {/* Terms */}
                        <p className="relative z-10 mt-8 text-xs text-center text-slate-500">
                            By continuing, you agree to our{' '}
                            <a href="#" className="text-slate-400 hover:text-white underline transition-colors">
                                terms of service
                            </a>{' '}
                            and{' '}
                            <a href="#" className="text-slate-400 hover:text-white underline transition-colors">
                                privacy policy
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
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
            <LoginContent />
        </Suspense>
    );
}
