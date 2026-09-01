/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../services/api';
import { User } from '../types';

const SESSION_EXPIRY_KEY = 'briyo_session_expires_at';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const readSessionExpiry = (): number | null => {
  try {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
};

const writeSessionExpiry = (value: number | null): void => {
  try {
    if (value == null) localStorage.removeItem(SESSION_EXPIRY_KEY);
    else localStorage.setItem(SESSION_EXPIRY_KEY, String(value));
  } catch {
    /* storage unavailable — session just follows Firebase persistence */
  }
};

interface AuthContextType {
  user: User | null;
  ready: boolean;
  /**
   * Completes the WhatsApp-OTP sign-in: verifies the OTP and establishes the
   * session. `remember` keeps the device signed in for 7 days; otherwise the
   * session ends when the browser closes.
   */
  login: (phone: string, otp: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // `ready` is false until the initial Firebase Auth state has resolved, so a page
  // refresh doesn't briefly bounce a signed-in user to /login before we know for sure.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setReady(true);
        return;
      }
      // Enforce the 7-day "remember this device" window.
      const expiresAt = readSessionExpiry();
      if (expiresAt != null && Date.now() > expiresAt) {
        writeSessionExpiry(null);
        await signOut(auth);
        setUser(null);
        setReady(true);
        return;
      }
      try {
        const profile = await api.getUserProfile(firebaseUser.uid);
        setUser(profile);
      } catch (e) {
        console.error('Failed to load user profile:', e);
        setUser(null);
      } finally {
        setReady(true);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (phone: string, otp: string, remember: boolean = true) => {
    const { token } = await api.loginWithOtp(phone, otp);
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const { user: firebaseUser } = await signInWithCustomToken(auth, token);
    writeSessionExpiry(remember ? Date.now() + SEVEN_DAYS_MS : null);
    // Set state directly rather than waiting on onAuthStateChanged's async callback —
    // callers navigate right after `login()` resolves, and ProtectedRoute needs
    // `isAuthenticated` to already be true at that point.
    const profile = await api.getUserProfile(firebaseUser.uid);
    setUser(profile);
  };

  const logout = async () => {
    writeSessionExpiry(null);
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
