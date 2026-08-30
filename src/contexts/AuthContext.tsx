/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../services/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    const { token } = await api.loginWithPassword(email, password);
    const { user: firebaseUser } = await signInWithCustomToken(auth, token);
    // Set state directly rather than waiting on onAuthStateChanged's async callback —
    // callers navigate right after `login()` resolves, and ProtectedRoute needs
    // `isAuthenticated` to already be true at that point.
    const profile = await api.getUserProfile(firebaseUser.uid);
    setUser(profile);
  };

  const logout = async () => {
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
