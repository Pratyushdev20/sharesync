import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/config/firebase";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { takeAuthNotice } from "@/services/googleAuth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:2000";

  // Message left by an automatic sign-out (e.g. Google email already used by a password account)
  useEffect(() => {
    const notice = takeAuthNotice();
    if (notice) setMessage(notice);
  }, []);

  async function handleForgotPassword() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage("Enter your email above, then tap \"Forgot password?\" again.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      // Same message either way so this cannot be used to discover which emails have accounts
    }
    setMessage("If an account exists for this email, a password reset link has been sent.");
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const userCredential = await login(email, password);
      const idToken = await userCredential.user.getIdToken();

      // Authenticate with backend using verified Firebase ID token
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setMessage(`Login successful! Welcome, ${data.data?.name || data.data?.email || "User"}!`);
        } else {
          setMessage(`Backend notice (${response.status}): ${data.message || "Authenticated with Firebase"}`);
        }
      } catch (backendErr: any) {
        setMessage(`Firebase login succeeded (backend server unreachable: ${backendErr.message})`);
      }
    } catch (error: any) {
      setMessage(error.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text style={styles.subtitle}>Sign In to your Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "Signing in..." : "Sign In with Firebase"}
        </Text>
      </Pressable>

      <Pressable onPress={handleForgotPassword} style={{ marginTop: 10 }}>
        <Text style={styles.linkText}>Forgot password?</Text>
      </Pressable>

      <Text style={styles.orText}>or</Text>
      <GoogleSignInButton onError={(m) => setMessage(m)} />

      {!!message && <Text style={styles.message}>{message}</Text>}


      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Pressable onPress={() => router.push("/signup")}>
          <Text style={styles.linkText}>Sign Up</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
    color: "#666",
  },
  input: {
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 8,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  message: {
    marginTop: 16,
    textAlign: "center",
    maxWidth: 400,
  },
  orText: {
    color: "#94a3b8",
    marginTop: 14,
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    color: "#64748b",
    fontSize: 14,
  },
  linkText: {
    color: "#2563eb",
    fontWeight: "bold",
    fontSize: 14,
  },
});
