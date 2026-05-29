/**
 * Firebase Admin SDK for Bot
 * Used for tracking play history
 */

import admin from 'firebase-admin';
import chalk from 'chalk';

let db: admin.firestore.Firestore | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export function initFirebase(): void {
    try {
        if (admin.apps.length > 0) {
            console.log(`[${chalk.bold.blueBright('FIREBASE')}] Already initialized`);
            db = admin.firestore();
            return;
        }

        const projectId = process.env.FIREBASE_PROJECT_ID;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

        if (!projectId || !privateKey || !clientEmail) {
            console.warn(`[${chalk.bold.yellowBright('FIREBASE')}] Missing Firebase credentials in .env, play history tracking disabled`);
            return;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                privateKey,
                clientEmail,
            }),
        });

        db = admin.firestore();
        console.log(`[${chalk.bold.greenBright('FIREBASE')}] Initialized successfully`);
    } catch (error) {
        console.error(`[${chalk.bold.redBright('FIREBASE')}] Failed to initialize:`, error);
    }
}

/**
 * Get Firestore instance
 */
export function getFirestore(): admin.firestore.Firestore | null {
    return db;
}

/**
 * Check if Firebase is initialized
 */
export function isFirebaseInitialized(): boolean {
    return db !== null;
}

export default admin;
