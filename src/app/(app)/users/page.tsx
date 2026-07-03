"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load users");
        setUsers((result.data ?? []) as UserRow[]);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Access control</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Users</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Review staff and admin accounts created in this inventory workspace.</p>
      </section>

      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-400">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-black text-slate-950">{user.full_name || "Unnamed user"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${user.role === "admin" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-semibold text-slate-500">
                      {new Date(user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
