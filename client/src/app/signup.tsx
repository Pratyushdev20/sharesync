import { useState } from "react";
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
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

  async function handleSignup() {
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    if (!email.trim() || !password) {
      setMessage("Please enter both email and password.");
      return;
    }
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters long.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    let userCredential: any = null;

    try {
      // 1. Create account in Firebase and set display name
      userCredential = await register(name.trim(), email.trim(), password);
      const idToken = await userCredential.user.getIdToken();

      // 2. Synchronize account with PostgreSQL backend
      try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ name: name.trim() }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          // Rollback newly created Firebase account if backend sync fails to prevent inconsistent state
          try {
            await userCredential.user.delete();
          } catch (deleteErr) {
            console.error("Firebase rollback error:", deleteErr);
          }
          setMessage(data.message || "Failed to synchronize user record with backend.");
          return;
        }

        // Registration and backend sync succeeded!
        // AuthProvider's onAuthStateChanged automatically transitions the user to Home ("/")
      } catch (backendErr: any) {
        // Rollback Firebase user if backend is unreachable
        try {
          await userCredential.user.delete();
        } catch (deleteErr) {
          console.error("Firebase rollback error:", deleteErr);
        }
        setMessage(`Registration failed: Backend server unreachable (${backendErr.message})`);
      }
    } catch (error: any) {
      setMessage(error.message || "Registration failed. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text style={styles.subtitle}>Create your ShareSync Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

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
        placeholder="Password (min 6 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "Creating Account..." : "Sign Up"}
        </Text>
      </Pressable>

      {!!message && <Text style={styles.message}>{message}</Text>}

      <Text style={styles.orText}>or</Text>
      <GoogleSignInButton label="Sign up with Google" onError={(m) => setMessage(m)} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Pressable onPress={() => router.push("/login")}>
          <Text style={styles.linkText}>Sign In</Text>
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
    color: "#1e3a8a",
  },
  subtitle: {
    marginBottom: 24,
    color: "#64748b",
    fontSize: 16,
  },
  input: {
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    backgroundColor: "#fff",
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
    fontSize: 16,
  },
  message: {
    marginTop: 16,
    textAlign: "center",
    maxWidth: 400,
    color: "#dc2626",
    fontSize: 14,
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
