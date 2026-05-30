'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
    User as FirebaseUser,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    OAuthProvider,
    GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { User } from '@/types/bot';
import { checkAdminRole } from '@/services/adminWhitelist';

interface AuthContextType {
    user: User | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    isAdmin: boolean;
    isDeveloper: boolean;
    adminRole: 'admin' | 'developer' | null;
    signInWithDiscord: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isDeveloper, setIsDeveloper] = useState(false);
    const [adminRole, setAdminRole] = useState<'admin' | 'developer' | null>(null);

    useEffect(() => {
        console.log('🔄 Setting up auth listener...');

        // Timeout fallback - บังคับให้ loading = false หลัง 3 วินาที
        const timeout = setTimeout(() => {
            console.warn('⏱️ Auth timeout - forcing loading to false');
            setLoading(false);
        }, 3000);

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            clearTimeout(timeout);
            console.log('👤 Auth state changed:', firebaseUser ? `User: ${firebaseUser.uid}` : 'No user');

            setFirebaseUser(firebaseUser);

            if (firebaseUser) {
                try {
                    const idToken = await firebaseUser.getIdToken();
                    const res = await fetch('/api/user/me', {
                        headers: { Authorization: `Bearer ${idToken}` },
                    });

                    if (res.ok) {
                        const { data: userData } = await res.json();
                        console.log('✅ User data fetched:', userData);

                        const defaultAvatarIndex = userData.discriminator && userData.discriminator !== '0'
                            ? parseInt(userData.discriminator) % 5
                            : Number(BigInt(userData.discordId || '0') >> BigInt(22)) % 6;
                        const avatarUrl = userData.avatar
                            ? `https://cdn.discordapp.com/avatars/${userData.discordId}/${userData.avatar}.png`
                            : `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;

                        const authUser: User = {
                            id: firebaseUser.uid,
                            discordId: userData.discordId || '',
                            username: userData.username || 'Unknown',
                            avatar: avatarUrl,
                            permissions: userData.permissions || [],
                            createdAt: userData.createdAt?._seconds
                                ? new Date(userData.createdAt._seconds * 1000)
                                : new Date(),
                        };
                        setUser(authUser);

                        if (userData.discordId) {
                            const roleInfo = await checkAdminRole(userData.discordId);
                            setIsAdmin(roleInfo.isAdmin);
                            setIsDeveloper(roleInfo.isDeveloper);
                            setAdminRole(roleInfo.role);
                        }
                    } else {
                        console.warn('⚠️ User document not found');
                        const authUser: User = {
                            id: firebaseUser.uid,
                            discordId: '',
                            username: firebaseUser.displayName || firebaseUser.email || 'Unknown',
                            avatar: firebaseUser.photoURL || '',
                            permissions: [],
                            createdAt: new Date(),
                        };
                        setUser(authUser);
                    }
                } catch (err) {
                    console.error('❌ Error fetching user data:', err);
                    const authUser: User = {
                        id: firebaseUser.uid,
                        discordId: '',
                        username: firebaseUser.displayName || 'Unknown',
                        avatar: firebaseUser.photoURL || '',
                        permissions: [],
                        createdAt: new Date(),
                    };
                    setUser(authUser);
                }
            } else {
                setUser(null);
                setIsAdmin(false);
                setIsDeveloper(false);
                setAdminRole(null);
            }

            console.log('✅ Setting loading to false');
            setLoading(false);
        });

        return () => {
            clearTimeout(timeout);
            unsubscribe();
        };
    }, []);

    const signInWithDiscord = async () => {
        try {
            console.log('🔵 Attempting Discord login...');
            const provider = new OAuthProvider('oidc.discord');
            provider.addScope('identify');
            provider.addScope('email');

            await signInWithPopup(auth, provider);
            console.log('✅ Discord login successful');
        } catch (error: any) {
            console.error('❌ Discord login error:', error);

            if (error.code === 'auth/configuration-not-found') {
                alert('Discord OAuth ยังไม่ได้ตั้งค่า\n\nกรุณาดูคู่มือใน FIREBASE_AUTH_SETUP.md\nหรือใช้ Google Login แทนชั่วคราว');
            } else if (error.code !== 'auth/popup-closed-by-user') {
                alert(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
            }
            throw error;
        }
    };

    const signInWithGoogle = async () => {
        try {
            console.log('🔴 Attempting Google login...');
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            console.log('✅ Google login successful');
        } catch (error: any) {
            console.error('❌ Google login error:', error);

            if (error.code === 'auth/configuration-not-found') {
                alert('Google OAuth ยังไม่ได้ตั้งค่า\n\nกรุณาเปิดใช้งานใน Firebase Console:\nAuthentication → Sign-in method → Google');
            } else if (error.code !== 'auth/popup-closed-by-user') {
                alert(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
            }
            throw error;
        }
    };

    const signOut = async () => {
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, firebaseUser, loading, isAdmin, isDeveloper, adminRole, signInWithDiscord, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
