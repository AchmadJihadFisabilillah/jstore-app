"use client";

import { useState, useEffect, type FormEvent } from "react";
import { KeyRound, UserPlus, Users, Trash2, Check, Loader2, ShieldCheck, UserCheck, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatDate } from "@/lib/inventory";

interface AppUserRecord {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
}

interface UserManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demo?: boolean;
}

export function UserManagementModal({ open, onOpenChange, demo = false }: UserManagementModalProps) {
  const [tab, setTab] = useState<"admins" | "password">("admins");
  
  // Change Password state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState("");

  // Create Admin state
  const [adminUsername, setAdminUsername] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // Admin list state
  const [adminList, setAdminList] = useState<AppUserRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);

  const loadAdmins = async () => {
    if (demo) {
      setAdminList([
        { id: "demo-owner", username: "owner", name: "Owner Toko", role: "owner", createdAt: new Date().toISOString() },
        { id: "demo-1", username: "budi", name: "Budi Santoso", role: "admin", createdAt: new Date().toISOString() },
        { id: "demo-2", username: "siti", name: "Siti Rahma", role: "admin", createdAt: new Date().toISOString() },
      ]);
      return;
    }
    setLoadingList(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setAdminList(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadAdmins();
      setPassError("");
      setCreateError("");
    }
  }, [open, demo]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassError("Konfirmasi password baru tidak cocok.");
      return;
    }
    if (newPassword.length < 4) {
      setPassError("Password baru minimal 4 karakter.");
      return;
    }

    setPassBusy(true);
    setPassError("");

    if (demo) {
      setTimeout(() => {
        toast.success("Password Owner berhasil diubah (mode contoh)");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPassBusy(false);
        onOpenChange(false);
      }, 500);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_owner_password",
          oldPassword: oldPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengubah password.");
      }

      toast.success("Password Owner berhasil diperbarui!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal mengubah password";
      setPassError(msg);
      toast.error(msg);
    } finally {
      setPassBusy(false);
    }
  };

  const handleCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminName.trim() || !adminPassword.trim()) {
      setCreateError("Semua field wajib diisi.");
      return;
    }

    setCreateBusy(true);
    setCreateError("");

    if (demo) {
      setTimeout(() => {
        const newRecord: AppUserRecord = {
          id: `demo-${Date.now()}`,
          username: adminUsername.trim().toLowerCase(),
          name: adminName.trim(),
          role: "admin",
          createdAt: new Date().toISOString(),
        };
        setAdminList((prev) => [newRecord, ...prev]);
        toast.success(`Admin @${newRecord.username} berhasil dibuat!`);
        setAdminUsername("");
        setAdminName("");
        setAdminPassword("");
        setCreateBusy(false);
      }, 400);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_admin",
          username: adminUsername.trim(),
          name: adminName.trim(),
          password: adminPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat akun admin.");
      }

      toast.success(`Admin @${adminUsername} berhasil dibuat!`);
      setAdminUsername("");
      setAdminName("");
      setAdminPassword("");
      loadAdmins();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membuat akun admin";
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDeleteAdmin = async (id: string, username: string) => {
    if (!confirm(`Hapus akun admin @${username}?`)) return;
    setDeleteBusy(id);

    if (demo) {
      setAdminList((prev) => prev.filter((u) => u.id !== id));
      toast.success(`Admin @${username} dihapus`);
      setDeleteBusy(null);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_admin", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus admin.");
      toast.success(`Admin @${username} berhasil dihapus.`);
      loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setDeleteBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal-content max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="text-[#e77740]" size={22} />
            <span>Pengaturan Akun & Admin</span>
          </DialogTitle>
          <DialogDescription>
            Khusus Owner: ganti password Owner atau buat akun petugas/admin baru.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "admins" | "password")}>
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="admins" className="flex items-center gap-2">
              <UserCheck size={16} />
              <span>Kelola Admin</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-2">
              <KeyRound size={16} />
              <span>Ganti Password Owner</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: KELOLA ADMIN */}
          <TabsContent value="admins" className="space-y-4">
            {/* Create Admin Form */}
            <form onSubmit={handleCreateAdmin} className="form-stack p-4 border border-[#eee8df] bg-[#faf8f5] rounded-xl">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-[#3e434e]">
                <UserPlus size={16} className="text-[#e77740]" />
                <span>Tambah Akun Admin Baru</span>
              </h3>

              <div className="form-row">
                <label className="field">
                  Username Login
                  <input
                    required
                    maxLength={30}
                    placeholder="Contoh: budi, siti"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                  />
                </label>
                <label className="field">
                  Nama Lengkap Petugas
                  <input
                    required
                    maxLength={50}
                    placeholder="Contoh: Budi Santoso"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                Password Akun Admin
                <div className="pin-input-wrapper">
                  <input
                    type={showAdminPass ? "text" : "password"}
                    required
                    maxLength={50}
                    placeholder="Minimal 4 karakter"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="pin-toggle-btn"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    tabIndex={-1}
                  >
                    {showAdminPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {createError && <p className="form-error">{createError}</p>}

              <div className="flex justify-end pt-1">
                <button type="submit" className="btn btn-primary" disabled={createBusy}>
                  {createBusy ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
                  <span>Buat Akun Admin</span>
                </button>
              </div>
            </form>

            {/* User List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#93979f] flex items-center justify-between">
                <span>Daftar Pengguna Toko ({adminList.length})</span>
              </h4>

              {loadingList ? (
                <div className="text-center py-4 text-xs text-[#999]">Memuat akun pengguna...</div>
              ) : adminList.length === 0 ? (
                <div className="text-center py-5 border border-dashed border-[#e3dfd7] rounded-lg text-xs text-[#999]">
                  Belum ada akun pengguna. Tambahkan admin di atas.
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {adminList.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2.5 bg-white border border-[#eae6df] rounded-lg text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-semibold text-[#25282f] truncate">
                            {user.name}
                          </strong>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              user.role === "owner"
                                ? "bg-[#fef3ec] text-[#e77740] border border-[#fbdacf]"
                                : "bg-[#f0f4f9] text-[#4b6584] border border-[#dce5ef]"
                            }`}
                          >
                            {user.role === "owner" ? "Owner" : "Admin"}
                          </span>
                        </div>
                        <small className="block text-[11px] text-[#8e939c]">
                          @{user.username} · Dibuat {formatDate(user.createdAt)}
                        </small>
                      </div>
                      {user.role !== "owner" && (
                        <button
                          type="button"
                          className="icon-btn text-[#c24141] hover:bg-[#fef2f2] ml-2"
                          title={`Hapus admin @${user.username}`}
                          disabled={deleteBusy === user.id}
                          onClick={() => handleDeleteAdmin(user.id, user.username)}
                        >
                          {deleteBusy === user.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: GANTI PASSWORD OWNER */}
          <TabsContent value="password">
            <form onSubmit={handleChangePassword} className="form-stack">
              <label className="field">
                Password Owner Saat Ini
                <div className="pin-input-wrapper">
                  <input
                    type={showOldPass ? "text" : "password"}
                    required
                    maxLength={50}
                    placeholder="Masukkan password lama..."
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="pin-toggle-btn"
                    onClick={() => setShowOldPass(!showOldPass)}
                    tabIndex={-1}
                  >
                    {showOldPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              <label className="field">
                Password Owner Baru
                <div className="pin-input-wrapper">
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    minLength={4}
                    maxLength={50}
                    placeholder="Minimal 4 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="pin-toggle-btn"
                    onClick={() => setShowNewPass(!showNewPass)}
                    tabIndex={-1}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              <label className="field">
                Konfirmasi Password Baru
                <input
                  type={showNewPass ? "text" : "password"}
                  required
                  maxLength={50}
                  placeholder="Ulangi password baru..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>

              {passError && <p className="form-error">{passError}</p>}

              <div className="form-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onOpenChange(false)}
                  disabled={passBusy}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={passBusy}>
                  {passBusy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                  <span>Simpan Password Baru</span>
                </button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
