'use client';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
      },
    });
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6 rounded-lg bg-card p-12">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Narze V6</h1>
        <p className="text-sm text-muted">Music dashboard for Discord</p>
        <button
          onClick={handleLogin}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
        >
          Sign in with Discord
        </button>
      </div>
    </div>
  );
}
