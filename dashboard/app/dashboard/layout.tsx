'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { LogOut, Music, History, Library, Settings, Search as IconSearch, Shield, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Prism from '@/components/Prism';
import { useSSE } from '@/hooks/useSSE';
import { FastAverageColor } from 'fast-average-color';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, isDeveloper, adminRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get selected guild from sessionStorage (same as dashboard page)
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('selectedGuildId');
    if (saved) setSelectedGuildId(saved);

    // Poll sessionStorage since storage event doesn't fire for same-window changes
    const pollInterval = setInterval(() => {
      const current = sessionStorage.getItem('selectedGuildId');
      if (current !== selectedGuildId) setSelectedGuildId(current);
    }, 500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [selectedGuildId]);

  // SSE subscription for track changes
  const { data: sseData } = useSSE(selectedGuildId);

  // Track current thumbnail for color extraction
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>();

  // Handle SSE events for thumbnail updates
  useEffect(() => {
    if (!sseData) return;

    if (sseData.type === 'init' || sseData.type === 'trackStart') {
      const track = sseData.data.track || sseData.data.current;
      if (track?.thumbnail) {
        setCurrentThumbnail(track.thumbnail);
      } else {
        setCurrentThumbnail(undefined);
      }
    } else if (sseData.type === 'trackEnd' || sseData.type === 'playerDestroy') {
      setCurrentThumbnail(undefined);
    }
  }, [sseData]);

  // Color extraction helpers
  const rgbToHsl = useCallback((r: number, g: number, b: number): [number, number, number] => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  }, []);

  const hslToHex = useCallback((h: number, s: number, l: number): string => {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, []);

  // Extract color from thumbnail and set CSS variable
  useEffect(() => {
    if (!currentThumbnail) {
      document.documentElement.style.setProperty('--bg-dominant-color', '');
      return;
    }

    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = currentThumbnail;

    img.onload = () => {
      try {
        const fac = new FastAverageColor();
        let color = fac.getColor(img, { algorithm: 'dominant' });
        let [h, s, l] = rgbToHsl(color.value[0], color.value[1], color.value[2]);

        // If too bright or desaturated, try sqrt algorithm
        if (l > 80 || s < 15) {
          const sqrtColor = fac.getColor(img, { algorithm: 'sqrt' });
          const [h2, s2, l2] = rgbToHsl(sqrtColor.value[0], sqrtColor.value[1], sqrtColor.value[2]);
          if (s2 > s || l2 < l) {
            color = sqrtColor;
            [h, s, l] = [h2, s2, l2];
          }
        }

        let finalHex = color.hex;
        if (l > 70) {
          l = Math.max(40, l - 30);
          finalHex = hslToHex(h, Math.min(s * 1.3, 100), l);
        } else if (s < 25 && l > 30) {
          s = Math.min(s * 2.5, 60);
          finalHex = hslToHex(h, s, Math.min(l, 50));
        }

        document.documentElement.style.setProperty('--bg-dominant-color', finalHex);
      } catch (e) {
        document.documentElement.style.setProperty('--bg-dominant-color', '');
      }
    };

    img.onerror = () => {
      document.documentElement.style.setProperty('--bg-dominant-color', '');
    };
  }, [currentThumbnail, rgbToHsl, hslToHex]);

  // Prism background toggle with localStorage persistence
  const [prismEnabled, setPrismEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('prismEnabled');
      return saved === null ? true : saved === 'true';
    }
    return true;
  });

  // Sync prismEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('prismEnabled', String(prismEnabled));
  }, [prismEnabled]);

  // คำนวณ activeSection จาก pathname
  const activeSection = useMemo(() => {
    if (pathname === '/dashboard') return 'home';
    if (pathname.startsWith('/dashboard/history')) return 'history';
    if (pathname.startsWith('/dashboard/library')) return 'library';
    if (pathname.startsWith('/dashboard/settings')) return 'settings';
    return 'home';
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Connect to presence tracking when user is logged in
  useEffect(() => {
    if (!user?.discordId) return;

    const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
    const params = new URLSearchParams({
      discordId: user.discordId,
      username: user.username || 'Unknown',
      avatarURL: user.avatar || ''
    });

    const eventSource = new EventSource(`${BOT_API_URL}/api/presence/connect?${params}`);

    eventSource.onerror = () => {
      // Reconnect handled by browser
    };

    return () => {
      eventSource.close();
    };
  }, [user?.discordId, user?.username, user?.avatar]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    try {
      // ยังทำไม่เสร็จ - จะเพิ่มในภายหลัง
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Music, href: '/dashboard' },
    { id: 'history', label: 'History', icon: History, href: '/dashboard/history' },
    { id: 'library', label: 'Library', icon: Library, href: '/dashboard/library' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/dashboard/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] py-4 px-3 sm:px-4 relative">
      {/* Prism Animated Background */}
      {prismEnabled && (
        <div className="fixed inset-0 z-0">
          <Prism
            animationType="rotate"
            timeScale={0.5}
            height={3.5}
            baseWidth={5.5}
            scale={3.6}
            hueShift={0}
            colorFrequency={1}
            noise={0.5}
            glow={1}
          />
          {/* Dark overlay filter */}
          <div className="absolute inset-0 bg-black/80" />
        </div>
      )}
      {!prismEnabled && (
        <>
          {/* Dynamic background from current playing track's dominant color */}
          <div
            className="fixed inset-0 z-0 transition-all duration-1000 ease-out"
            style={{
              background: 'var(--bg-dominant-color, #0d0d0d)',
            }}
          />
          {/* Dark gradient overlay for readability */}
          <div
            className="fixed inset-0 z-0"
            style={{
              background: 'linear-gradient(135deg, rgba(13,13,13,0.85) 0%, rgba(13,13,13,0.92) 50%, rgba(13,13,13,0.98) 100%)',
            }}
          />
        </>
      )}

      <div className="grid h-[calc(100vh-32px)] gap-4 lg:grid-cols-[240px,1fr] relative z-10">
        {/* Sidebar card (sticky) */}
        <aside className="card-surface flex flex-col p-5 overflow-hidden h-full sticky top-3">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-purple-900/30">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rythm</p>
              <span className="text-lg font-semibold text-white">Narze</span>
            </div>
          </div>

          {/* User Profile */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3 mb-4">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-slate-300">{user.username?.[0] ?? '?'}</div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.username}</p>
              <p className="text-xs text-slate-400">
                {isDeveloper ? 'Developer' : isAdmin ? 'Admin' : 'User'}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all ${active
                    ? 'text-white bg-white/10 border border-white/20 shadow-lg shadow-black/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                >
                  {active && <span className="absolute left-1 top-1/2 -translate-y-1/2 h-[70%] w-1 rounded-full bg-gradient-to-b from-purple-400 to-blue-500" />}
                  <Icon className={`h-5 w-5 ${active ? 'text-purple-300' : 'text-slate-500 group-hover:text-purple-200'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            {/* Admin Panel Link */}
            {(isAdmin || isDeveloper) && (
              <Link
                href="/admin"
                className="group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 mt-4"
              >
                <Shield className="h-5 w-5 text-purple-400" />
                <span className="truncate">Admin Panel</span>
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300">
                  {adminRole}
                </span>
              </Link>
            )}
          </nav>

          {/* Sign Out */}
          <div className="mt-4 space-y-2">
            {/* Prism Toggle */}
            <button
              onClick={() => setPrismEnabled(!prismEnabled)}
              className={`w-full inline-flex items-center gap-2 rounded-full border px-4 py-2 justify-center transition-colors ${prismEnabled
                ? 'border-purple-500/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-300 hover:border-white/20'
                }`}
              title={prismEnabled ? 'คลิกเพื่อปิด Prism Effect (ประหยัดทรัพยากร)' : 'คลิกเพื่อเปิด Prism Effect'}
            >
              <Sparkles className={`h-4 w-4 ${prismEnabled ? 'text-purple-400' : 'text-slate-500'}`} />
              <span className="text-sm">Prism {prismEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={handleSignOut}
              className="w-full inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 justify-center text-slate-300 hover:text-red-200 hover:border-red-400/60 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Content card */}
        <main className="card-surface overflow-hidden h-full flex flex-col">
          {/* Header with Search */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/5 bg-[#121212]/80 px-6 py-4 backdrop-blur-md">
            <div className="flex-1 max-w-xl">
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-purple-400 transition-colors">
                  <IconSearch className="h-4 w-4" />
                </div>
                <input
                  name="q"
                  type="text"
                  placeholder="Search songs, artists, albums..."
                  defaultValue={new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('q') || ''}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (searchTimeoutRef.current) {
                      clearTimeout(searchTimeoutRef.current);
                    }

                    searchTimeoutRef.current = setTimeout(() => {
                      if (value.trim()) {
                        router.push(`/dashboard/search?q=${encodeURIComponent(value)}`);
                      } else if (pathname === '/dashboard/search') {
                        router.push('/dashboard/search');
                      }
                    }, 1000); // 1000ms debounce
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const value = (e.target as HTMLInputElement).value.trim();

                      // Clear pending debounce
                      if (searchTimeoutRef.current) {
                        clearTimeout(searchTimeoutRef.current);
                      }

                      // Immediately navigate
                      if (value) {
                        router.push(`/dashboard/search?q=${encodeURIComponent(value)}`);
                      }
                    }
                  }}
                  className="h-10 w-full rounded-full border border-white/10 bg-white/5 backdrop-blur-sm pl-9 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:border-purple-500/50 focus:bg-white/10 focus:outline-none focus:ring-4 focus:ring-purple-500/10"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Dynamic Title based on section */}
            <div className="hidden sm:block">
              <span className="text-sm font-medium text-slate-400 capitalize">{activeSection}</span>
            </div>
          </header>

          <div id="main-scroll-container" className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
