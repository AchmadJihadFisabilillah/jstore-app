"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, UserCheck, Lock, User, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { AuthUser } from "@/lib/auth";

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser) => void;
  onEnterDemo?: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [role, setRole] = useState<"owner" | "admin">("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleRoleChange = (newRole: "owner" | "admin") => {
    setRole(newRole);
    setError("");
    if (newRole === "owner" && !username) {
      setUsername("owner");
    } else if (newRole === "admin" && username === "owner") {
      setUsername("");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Masukkan username terlebih dahulu");
      return;
    }
    if (!password.trim()) {
      setError("Masukkan password terlebih dahulu");
      return;
    }

    const effectiveRole = trimmedUsername.toLowerCase() === "owner" ? "owner" : role;

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: effectiveRole,
          username: trimmedUsername,
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login gagal. Username atau password salah.");
      }

      toast.success(`Selamat datang, ${data.user.name}!`);
      onLoginSuccess(data.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal masuk";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-brand-logo">
            <span className="brand-char">J</span>
          </div>
          <h1>
            JStore<span className="text-[#e77740]">.</span>
            <small>DIGITAL</small>
          </h1>
        </div>

        {/* Role Selector Tabs */}
        <div className="login-role-tabs">
          <button
            type="button"
            className={`role-tab ${role === "owner" ? "active" : ""}`}
            onClick={() => handleRoleChange("owner")}
          >
            <ShieldCheck size={18} />
            <strong>Owner</strong>
          </button>
          <button
            type="button"
            className={`role-tab ${role === "admin" ? "active" : ""}`}
            onClick={() => handleRoleChange("admin")}
          >
            <UserCheck size={18} />
            <strong>Petugas / Admin</strong>
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="login-username">
              <User size={15} />
              <span>Username:</span>
            </label>
            <input
              id="login-username"
              type="text"
              required
              maxLength={50}
              placeholder={role === "owner" ? "Username owner..." : "Masukkan username..."}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">
              <Lock size={15} />
              <span>Password:</span>
            </label>
            <div className="pin-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                maxLength={50}
                placeholder="Masukkan password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pin-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <span>Masuk</span>
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
