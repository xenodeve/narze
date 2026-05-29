'use client';

/**
 * Admin Whitelist Service - Calls API route (which uses Firebase Admin SDK)
 * This bypasses Firestore security rules
 */

export interface WhitelistEntry {
    discordId: string;
    username: string;
    role: 'admin' | 'developer';
    addedAt: Date;
    addedBy: string;
}

/**
 * Check if a user is in the admin whitelist
 */
export async function checkAdminRole(discordId: string): Promise<{ isAdmin: boolean; isDeveloper: boolean; role: 'admin' | 'developer' | null }> {
    if (!discordId) {
        return { isAdmin: false, isDeveloper: false, role: null };
    }

    try {
        const res = await fetch(`/api/admin/whitelist?discordId=${encodeURIComponent(discordId)}`);
        if (!res.ok) {
            throw new Error('Failed to check admin role');
        }
        const data = await res.json();
        return {
            isAdmin: data.isAdmin,
            isDeveloper: data.isDeveloper,
            role: data.role
        };
    } catch (error: any) {
        console.warn('[AdminWhitelist] Error checking admin role:', error?.message);
        return { isAdmin: false, isDeveloper: false, role: null };
    }
}

/**
 * Get all whitelist entries
 */
export async function getWhitelist(): Promise<WhitelistEntry[]> {
    try {
        const res = await fetch('/api/admin/whitelist');
        if (!res.ok) {
            throw new Error('Failed to get whitelist');
        }
        const data = await res.json();
        return (data.entries || []).map((entry: any) => ({
            ...entry,
            addedAt: new Date(entry.addedAt)
        }));
    } catch (error: any) {
        console.warn('[AdminWhitelist] Error getting whitelist:', error?.message);
        return [];
    }
}

/**
 * Add user to whitelist
 */
export async function addToWhitelist(
    discordId: string,
    username: string,
    role: 'admin' | 'developer',
    addedBy: string
): Promise<boolean> {
    try {
        const res = await fetch('/api/admin/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, username, role, addedBy })
        });
        return res.ok;
    } catch (error: any) {
        console.warn('[AdminWhitelist] Error adding to whitelist:', error?.message);
        return false;
    }
}

/**
 * Remove user from whitelist
 */
export async function removeFromWhitelist(discordId: string): Promise<boolean> {
    try {
        const res = await fetch(`/api/admin/whitelist?discordId=${encodeURIComponent(discordId)}`, {
            method: 'DELETE'
        });
        return res.ok;
    } catch (error: any) {
        console.warn('[AdminWhitelist] Error removing from whitelist:', error?.message);
        return false;
    }
}

/**
 * Update user role in whitelist
 */
export async function updateWhitelistRole(
    discordId: string,
    newRole: 'admin' | 'developer'
): Promise<boolean> {
    try {
        const res = await fetch('/api/admin/whitelist', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, role: newRole })
        });
        return res.ok;
    } catch (error: any) {
        console.warn('[AdminWhitelist] Error updating whitelist role:', error?.message);
        return false;
    }
}
