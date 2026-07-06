"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AllowedEmail,
  BusinessSettings,
  Category,
  Location,
  Profile,
  Role,
  Supplier,
} from "@/lib/types";

export default function SettingsPage() {
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<AllowedEmail[]>([]);
  const [newInvite, setNewInvite] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocation, setNewLocation] = useState("");

  const [biz, setBiz] = useState({
    name: "",
    address: "",
    phone: "",
    gstin: "",
    invoice_prefix: "INV",
  });
  const [bizSaved, setBizSaved] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [
      { data: cats },
      { data: sups },
      { data: profiles },
      { data: inv },
      { data: bs },
      { data: locs },
    ] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("profiles").select("*").order("created_at"),
      // Staff mate RLS aa query block kare che — error ignore
      supabase.from("allowed_emails").select("*").order("created_at"),
      supabase.from("business_settings").select("*").eq("id", 1).single(),
      supabase.from("locations").select("*").order("name"),
    ]);
    setLocations((locs ?? []) as Location[]);
    const bsRow = bs as BusinessSettings | null;
    if (bsRow) {
      setBiz({
        name: bsRow.name,
        address: bsRow.address,
        phone: bsRow.phone,
        gstin: bsRow.gstin,
        invoice_prefix: bsRow.invoice_prefix,
      });
    }
    setCategories((cats ?? []) as Category[]);
    setSuppliers((sups ?? []) as Supplier[]);
    const all = (profiles ?? []) as Profile[];
    setTeam(all);
    setMe(all.find((p) => p.id === user?.id) ?? null);
    setInvites((inv ?? []) as AllowedEmail[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function friendly(message: string) {
    if (message.includes("row-level security"))
      return "Aa action mate admin role joie";
    if (message.includes("duplicate")) return "Aa name already exist kare che";
    return message;
  }

  const isAdmin = me?.role === "admin";

  async function addCategory() {
    if (!newCategory.trim()) return;
    setError(null);
    const { error } = await supabase
      .from("categories")
      .insert({ name: newCategory.trim() });
    if (error) return setError(friendly(error.message));
    setNewCategory("");
    load();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Category delete karvi che? Products ma thi remove thai jashe."))
      return;
    setError(null);
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return setError(friendly(error.message));
    load();
  }

  async function addSupplier() {
    if (!newSupplier.name.trim()) return;
    setError(null);
    const { error } = await supabase.from("suppliers").insert({
      name: newSupplier.name.trim(),
      phone: newSupplier.phone.trim() || null,
    });
    if (error) return setError(friendly(error.message));
    setNewSupplier({ name: "", phone: "" });
    load();
  }

  async function deleteSupplier(id: string) {
    if (!confirm("Supplier delete karvo che?")) return;
    setError(null);
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return setError(friendly(error.message));
    load();
  }

  // ---------- TEAM (admin only) ----------
  async function changeRole(id: string, role: Role) {
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id);
    if (error) return setError(friendly(error.message));
    load();
  }

  async function addInvite() {
    const email = newInvite.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Valid email nakho");
      return;
    }
    setError(null);
    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email, added_by: me?.id });
    if (error) return setError(friendly(error.message));
    setNewInvite("");
    load();
  }

  async function removeInvite(email: string) {
    setError(null);
    const { error } = await supabase
      .from("allowed_emails")
      .delete()
      .eq("email", email);
    if (error) return setError(friendly(error.message));
    load();
  }

  async function addLocation() {
    if (!newLocation.trim()) return;
    setError(null);
    const { error } = await supabase
      .from("locations")
      .insert({ name: newLocation.trim() });
    if (error) return setError(friendly(error.message));
    setNewLocation("");
    load();
  }

  async function makeDefaultLocation(id: string) {
    setError(null);
    const { error: e1 } = await supabase
      .from("locations")
      .update({ is_default: false })
      .eq("is_default", true);
    if (e1) return setError(friendly(e1.message));
    const { error: e2 } = await supabase
      .from("locations")
      .update({ is_default: true })
      .eq("id", id);
    if (e2) return setError(friendly(e2.message));
    load();
  }

  async function deleteLocation(id: string) {
    if (!confirm("Location delete karvi che?")) return;
    setError(null);
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      return setError(
        error.message.includes("violates foreign key")
          ? "Aa location par stock entries che — delete nathi thai shakti"
          : friendly(error.message)
      );
    }
    load();
  }

  async function saveBusiness() {
    setError(null);
    setBizSaved(false);
    const { error } = await supabase
      .from("business_settings")
      .update({
        name: biz.name.trim(),
        address: biz.address.trim(),
        phone: biz.phone.trim(),
        gstin: biz.gstin.trim(),
        invoice_prefix: biz.invoice_prefix.trim() || "INV",
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return setError(friendly(error.message));
    setBizSaved(true);
    setTimeout(() => setBizSaved(false), 2500);
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Settings</h1>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* BUSINESS PROFILE — admin only, invoice par aave che */}
      {isAdmin && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Business profile
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Aa details GST invoice na header ma aave che
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Business name"
              value={biz.name}
              onChange={(e) => setBiz((b) => ({ ...b, name: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Phone"
              value={biz.phone}
              onChange={(e) => setBiz((b) => ({ ...b, phone: e.target.value }))}
            />
            <input
              className={input}
              placeholder="GSTIN"
              value={biz.gstin}
              onChange={(e) => setBiz((b) => ({ ...b, gstin: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Invoice prefix (e.g. INV)"
              value={biz.invoice_prefix}
              onChange={(e) =>
                setBiz((b) => ({ ...b, invoice_prefix: e.target.value }))
              }
            />
            <textarea
              className={`${input} sm:col-span-2`}
              rows={2}
              placeholder="Address"
              value={biz.address}
              onChange={(e) =>
                setBiz((b) => ({ ...b, address: e.target.value }))
              }
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveBusiness}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Save
            </button>
            {bizSaved && (
              <span className="text-sm text-emerald-700">✓ Saved</span>
            )}
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* CATEGORIES */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Categories</h2>
          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <input
                className={`${input} flex-1`}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="New category name"
              />
              <button
                onClick={addCategory}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Add
              </button>
            </div>
          )}
          <ul className="mt-3 divide-y divide-stone-100">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between py-2.5"
              >
                <span className="text-sm text-stone-800">{c.name}</span>
                {isAdmin && (
                  <button
                    onClick={() => deleteCategory(c.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
            {categories.length === 0 && (
              <li className="py-3 text-sm text-stone-500">No categories yet</li>
            )}
          </ul>
        </section>

        {/* SUPPLIERS */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Suppliers</h2>
          {isAdmin && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className={`${input} flex-1`}
                value={newSupplier.name}
                onChange={(e) =>
                  setNewSupplier((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Supplier name"
              />
              <input
                className={`${input} sm:w-36`}
                value={newSupplier.phone}
                onChange={(e) =>
                  setNewSupplier((s) => ({ ...s, phone: e.target.value }))
                }
                placeholder="Phone"
              />
              <button
                onClick={addSupplier}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Add
              </button>
            </div>
          )}
          <ul className="mt-3 divide-y divide-stone-100">
            {suppliers.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <span className="text-sm text-stone-800">{s.name}</span>
                  {s.phone && (
                    <span className="ml-2 text-xs text-stone-500">
                      {s.phone}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => deleteSupplier(s.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
            {suppliers.length === 0 && (
              <li className="py-3 text-sm text-stone-500">No suppliers yet</li>
            )}
          </ul>
        </section>

        {/* LOCATIONS */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Locations</h2>
          <p className="mt-1 text-xs text-stone-500">
            Godown / store / branch — stock location-wise track thay che
          </p>
          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <input
                className={`${input} flex-1`}
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLocation()}
                placeholder="e.g. Godown 2"
              />
              <button
                onClick={addLocation}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Add
              </button>
            </div>
          )}
          <ul className="mt-3 divide-y divide-stone-100">
            {locations.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between py-2.5"
              >
                <span className="text-sm text-stone-800">
                  {l.name}
                  {l.is_default && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      default
                    </span>
                  )}
                </span>
                {isAdmin && !l.is_default && (
                  <span className="flex gap-3">
                    <button
                      onClick={() => makeDefaultLocation(l.id)}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      Make default
                    </button>
                    <button
                      onClick={() => deleteLocation(l.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            ))}
            {locations.length === 0 && (
              <li className="py-3 text-sm text-stone-500">
                No locations yet — upgrade SQL run karo
              </li>
            )}
          </ul>
        </section>

        {/* TEAM — admin only */}
        {isAdmin && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Team</h2>
            <p className="mt-1 text-xs text-stone-500">
              Staff scan + stock entry kari shake. Admin badhu kari shake.
            </p>
            <ul className="mt-3 divide-y divide-stone-100">
              {team.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-stone-800">
                    {p.full_name || "(no name)"}
                    {p.id === me?.id && (
                      <span className="ml-2 text-xs text-stone-400">you</span>
                    )}
                  </span>
                  {p.id === me?.id ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {p.role}
                    </span>
                  ) : (
                    <select
                      className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                      value={p.role}
                      onChange={(e) => changeRole(p.id, e.target.value as Role)}
                    >
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* INVITES — admin only */}
        {isAdmin && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">
              Invited emails
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Fakt aa list na emails signup kari shakse
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                className={`${input} flex-1`}
                value={newInvite}
                onChange={(e) => setNewInvite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addInvite()}
                placeholder="staff@example.com"
              />
              <button
                onClick={addInvite}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Invite
              </button>
            </div>
            <ul className="mt-3 divide-y divide-stone-100">
              {invites.map((i) => (
                <li
                  key={i.email}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-stone-800">{i.email}</span>
                  <button
                    onClick={() => removeInvite(i.email)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {invites.length === 0 && (
                <li className="py-3 text-sm text-stone-500">
                  No invites yet — signup band che
                </li>
              )}
            </ul>
          </section>
        )}
      </div>

      {!isAdmin && (
        <p className="mt-4 text-xs text-stone-400">
          Categories, suppliers ane team manage karva admin role joie.
        </p>
      )}
    </div>
  );
}
