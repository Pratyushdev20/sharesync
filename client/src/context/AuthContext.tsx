import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  UserCredential,
} from "firebase/auth";
import { auth } from "@/config/firebase";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserCredential>;
  register: (name: string, email: string, password: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // onAuthStateChanged returns an Unsubscribe function
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (error) => {
        console.error("Auth state change error:", error);
        setUser(null);
        setLoading(false);
      }
    );

    // Properly unsubscribe when unmounting
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<UserCredential> => {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const register = async (name: string, email: string, password: string): Promise<UserCredential> => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    return credential;
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch (error) {
      console.error("Get ID token error:", error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
