import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api/config';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inactivity timeout: auto-logout after 30 min idle
  useEffect(() => {
    if (!user) return;
    const resetTimer = () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      inactivityRef.current = setTimeout(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
        window.location.href = '/login';
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  // On mount, validate stored token and restore session
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    axios
      .get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await axios.post(`${API_BASE}/auth/login`, { username, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    const me = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    setUser(me.data);
    // Pre-cache stock data in background while user navigates
    axios.post(`${API_BASE}/refresh/tickers`, {}, { headers: { Authorization: `Bearer ${data.access_token}` } }).catch(() => {});
    axios.post(`${API_BASE}/refresh/intraday/all?limit=50`, {}, { headers: { Authorization: `Bearer ${data.access_token}` } }).catch(() => {});
  };

  const register = async (username: string, email: string, password: string) => {
    await axios.post(`${API_BASE}/auth/register`, { username, email, password });
    await login(username, password);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
