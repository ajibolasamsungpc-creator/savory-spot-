
import { useState } from "react";
import { supabase } from "./supabase";
import "./AdminLogin.css";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) throw error;

      if (!data.user) {
        setError("Sign in failed. Please check your credentials and try again.");
        return;
      }

      window.location.assign("/admin/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <div className="admin-logo">🍽️</div>

        <h1>Savory Spot</h1>
        <p className="admin-subtitle">Administrator Login</p>

        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="admin-email">Email Address</label>
        <input
          id="admin-email"
          type="email"
          placeholder="Enter your admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <a
          className="admin-back-link"
          href="/"
        >
          ← Back to Homepage
        </a>
      </form>
    </main>
  );
}
