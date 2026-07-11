"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/mongodb/client";
import type {
  AllowedEmail,
  BusinessSettings,
  Category,
  Location,
  Profile,
  Role,
  Supplier,
} from "@/lib/types";
import {
  ActionMenu,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  menuItemClass,
  useToast,
} from "@/components/DashboardUI";

type SettingsTab = "business" | "catalog" | "locations" | "team";
type EditorKind = "category" | "invite" | "location" | "supplier";

interface EditorState {
  address: string;
  email: string;
  id?: string;
  kind: EditorKind;
  name: string;
  phone: string;
}

interface DeleteState {
  id: string;
  kind: EditorKind;
  label: string;
}

const emptyBusiness = {
  address: "",
  gstin: "",
  invoice_prefix: "INV",
  name: "",
  phone: "",
};

const inputClass =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-600 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-stone-700";

export default function SettingsPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("business");
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<AllowedEmail[]>([]);
  const [business, setBusiness] = useState(emptyBusiness);
  const [businessBaseline, setBusinessBaseline] = useState(JSON.stringify(emptyBusiness));
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendly = useCallback((message: string) => {
    if (message.includes("admin role")) return "Aa action mate admin role joie";
    if (message.includes("duplicate") || message.includes("E11000")) {
      return "Aa value already exist kare che";
    }
    if (message.includes("purchase history")) {
      return "Aa supplier ni purchase history che, etle delete nathi thai shakta";
    }
    if (message.includes("foreign key")) {
      return "Aa location par stock history che, etle delete nathi thai shakti";
    }
    return message;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const authResult = await supabase.auth.getUser();
    const user = authResult.data?.user as { id?: string; role?: Role } | null;
    const admin = user?.role === "admin";
    const [categoryResult, supplierResult, profileResult, businessResult, locationResult, inviteResult] =
      await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("business_settings").select("*").eq("id", 1).single(),
        supabase.from("locations").select("*").order("name"),
        admin
          ? supabase.from("allowed_emails").select("*").order("created_at")
          : Promise.resolve({ data: [], error: null }),
      ]);

    const loadError =
      categoryResult.error ??
      supplierResult.error ??
      profileResult.error ??
      businessResult.error ??
      locationResult.error ??
      inviteResult.error;
    if (loadError) setError(friendly(loadError.message));

    setCategories((categoryResult.data ?? []) as Category[]);
    setSuppliers((supplierResult.data ?? []) as Supplier[]);
    setLocations((locationResult.data ?? []) as Location[]);
    const profiles = (profileResult.data ?? []) as Profile[];
    setTeam(profiles);
    setMe(profiles.find((profile) => profile.id === user?.id) ?? null);
    setInvites((inviteResult.data ?? []) as AllowedEmail[]);
    const row = businessResult.data as BusinessSettings | null;
    if (row) {
      const nextBusiness = {
        address: row.address,
        gstin: row.gstin,
        invoice_prefix: row.invoice_prefix,
        name: row.name,
        phone: row.phone,
      };
      setBusiness(nextBusiness);
      setBusinessBaseline(JSON.stringify(nextBusiness));
    }
    if (!admin) setActiveTab("catalog");
    setLoading(false);
  }, [friendly, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = me?.role === "admin";
  const businessDirty = JSON.stringify(business) !== businessBaseline;

  const tabs = useMemo(
    () =>
      [
        isAdmin ? { id: "business" as const, label: "Business" } : null,
        { id: "catalog" as const, label: "Catalog" },
        { id: "locations" as const, label: "Locations" },
        isAdmin ? { id: "team" as const, label: "Team & access" } : null,
      ].filter((tab): tab is { id: SettingsTab; label: string } => tab !== null),
    [isAdmin]
  );

  function openEditor(kind: EditorKind, record?: Category | Supplier | Location) {
    setError(null);
    if (kind === "category") {
      const category = record as Category | undefined;
      setEditor({ address: "", email: "", id: category?.id, kind, name: category?.name ?? "", phone: "" });
      return;
    }
    if (kind === "supplier") {
      const supplier = record as Supplier | undefined;
      setEditor({
        address: supplier?.address ?? "",
        email: "",
        id: supplier?.id,
        kind,
        name: supplier?.name ?? "",
        phone: supplier?.phone ?? "",
      });
      return;
    }
    if (kind === "location") {
      const location = record as Location | undefined;
      setEditor({ address: "", email: "", id: location?.id, kind, name: location?.name ?? "", phone: "" });
      return;
    }
    setEditor({ address: "", email: "", kind, name: "", phone: "" });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    setSaving(true);
    setError(null);
    let result: { error: { message: string } | null };
    if (editor.kind === "invite") {
      const email = editor.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Valid email nakho");
        setSaving(false);
        return;
      }
      result = await supabase.from("allowed_emails").insert({ email });
    } else {
      const name = editor.name.trim();
      if (!name) {
        setError("Name jaruri che");
        setSaving(false);
        return;
      }
      const table =
        editor.kind === "category"
          ? "categories"
          : editor.kind === "supplier"
            ? "suppliers"
            : "locations";
      const payload =
        editor.kind === "supplier"
          ? { address: editor.address.trim() || null, name, phone: editor.phone.trim() || null }
          : { name };
      result = editor.id
        ? await supabase.from(table).update(payload).eq("id", editor.id)
        : await supabase.from(table).insert(payload);
    }
    setSaving(false);
    if (result.error) {
      setError(friendly(result.error.message));
      return;
    }
    const message = editor.id ? "Changes saved" : editor.kind === "invite" ? "Invitation added" : "Record added";
    setEditor(null);
    await load();
    showToast(message);
  }

  async function runDelete() {
    if (!deleteTarget || saving) return;
    setSaving(true);
    setError(null);
    const table =
      deleteTarget.kind === "category"
        ? "categories"
        : deleteTarget.kind === "supplier"
          ? "suppliers"
          : deleteTarget.kind === "location"
            ? "locations"
            : "allowed_emails";
    const column = deleteTarget.kind === "invite" ? "email" : "id";
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq(column, deleteTarget.id);
    setSaving(false);
    if (deleteError) {
      setError(friendly(deleteError.message));
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    await load();
    showToast("Record removed");
  }

  async function makeDefaultLocation(location: Location) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("set_default_location", {
      p_location_id: location.id,
    });
    setSaving(false);
    if (rpcError) {
      setError(friendly(rpcError.message));
      return;
    }
    await load();
    showToast(`${location.name} is now the default location`);
  }

  async function changeRole(profile: Profile, role: Role) {
    if (saving || profile.role === role) return;
    setSaving(true);
    setError(null);
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", profile.id);
    setSaving(false);
    if (roleError) {
      setError(friendly(roleError.message));
      return;
    }
    await load();
    showToast(`${profile.full_name || "Team member"} is now ${role}`);
  }

  async function saveBusiness() {
    if (saving || !businessDirty) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("business_settings")
      .update({
        address: business.address.trim(),
        gstin: business.gstin.trim(),
        invoice_prefix: business.invoice_prefix.trim() || "INV",
        name: business.name.trim(),
        phone: business.phone.trim(),
      })
      .eq("id", 1);
    setSaving(false);
    if (saveError) {
      setError(friendly(saveError.message));
      return;
    }
    setBusinessBaseline(JSON.stringify(business));
    showToast("Business profile saved");
  }

  const editorTitle = editor
    ? `${editor.id ? "Edit" : "Add"} ${
        editor.kind === "invite" ? "invitation" : editor.kind
      }`
    : "Edit";

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "Business, catalog, locations, and team access"
            : "Catalog and location reference information"
        }
      />

      {error && !editor && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-5 flex max-w-full overflow-x-auto border-b border-stone-300" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              activeTab === tab.id
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-stone-200 bg-white">
          <LoadingState label="Loading settings" />
        </div>
      ) : (
        <>
          {activeTab === "business" && isAdmin && (
            <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5">
              <div className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-stone-950">Business profile</h2>
                  <p className="mt-1 text-sm text-stone-500">Used on invoices and credit notes.</p>
                </div>
                <button
                  type="button"
                  onClick={saveBusiness}
                  disabled={saving || !businessDirty}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="business-name" className={labelClass}>Business name</label>
                  <input id="business-name" className={inputClass} value={business.name} onChange={(event) => setBusiness((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <label htmlFor="business-phone" className={labelClass}>Phone</label>
                  <input id="business-phone" type="tel" className={inputClass} value={business.phone} onChange={(event) => setBusiness((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div>
                  <label htmlFor="business-gstin" className={labelClass}>GSTIN</label>
                  <input id="business-gstin" className={`${inputClass} uppercase`} value={business.gstin} onChange={(event) => setBusiness((current) => ({ ...current, gstin: event.target.value }))} />
                </div>
                <div>
                  <label htmlFor="invoice-prefix" className={labelClass}>Invoice prefix</label>
                  <input id="invoice-prefix" className={inputClass} value={business.invoice_prefix} onChange={(event) => setBusiness((current) => ({ ...current, invoice_prefix: event.target.value }))} maxLength={20} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="business-address" className={labelClass}>Address</label>
                  <textarea id="business-address" rows={4} className={inputClass} value={business.address} onChange={(event) => setBusiness((current) => ({ ...current, address: event.target.value }))} />
                </div>
              </div>
            </section>
          )}

          {activeTab === "catalog" && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-stone-200 bg-white">
                <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-950">Categories</h2>
                    <p className="mt-0.5 text-xs text-stone-500">Group products for filtering and reports.</p>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditor("category")} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">Add</button>
                  )}
                </div>
                {categories.length === 0 ? (
                  <EmptyState title="No categories" description="Add a category to organize products." />
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {categories.map((category) => (
                      <li key={category.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm font-medium text-stone-800">{category.name}</span>
                        {isAdmin && (
                          <ActionMenu label={`Actions for ${category.name}`}>
                            <button type="button" onClick={() => openEditor("category", category)} className={menuItemClass}>Edit</button>
                            <button type="button" onClick={() => setDeleteTarget({ id: category.id, kind: "category", label: category.name })} className={`${menuItemClass} text-red-700`}>Delete</button>
                          </ActionMenu>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-stone-200 bg-white">
                <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-950">Suppliers</h2>
                    <p className="mt-0.5 text-xs text-stone-500">Contacts available on purchase orders.</p>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => openEditor("supplier")} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">Add</button>
                  )}
                </div>
                {suppliers.length === 0 ? (
                  <EmptyState title="No suppliers" description="Add a supplier for purchase orders." />
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {suppliers.map((supplier) => (
                      <li key={supplier.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-stone-800">{supplier.name}</p>
                          <p className="truncate text-xs text-stone-500">{supplier.phone || "No phone"}</p>
                        </div>
                        {isAdmin && (
                          <ActionMenu label={`Actions for ${supplier.name}`}>
                            <button type="button" onClick={() => openEditor("supplier", supplier)} className={menuItemClass}>Edit</button>
                            <button type="button" onClick={() => setDeleteTarget({ id: supplier.id, kind: "supplier", label: supplier.name })} className={`${menuItemClass} text-red-700`}>Delete</button>
                          </ActionMenu>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {activeTab === "locations" && (
            <section className="mt-4 rounded-lg border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-stone-950">Stock locations</h2>
                  <p className="mt-0.5 text-xs text-stone-500">Stores, warehouses, and branches used by stock entries.</p>
                </div>
                {isAdmin && (
                  <button type="button" onClick={() => openEditor("location")} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">Add location</button>
                )}
              </div>
              {locations.length === 0 ? (
                <EmptyState title="No locations" description="Add a location before recording stock." />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {locations.map((location) => (
                    <li key={location.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-stone-800">{location.name}</span>
                        {location.is_default && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Default</span>}
                      </div>
                      {isAdmin && (
                        <ActionMenu label={`Actions for ${location.name}`}>
                          <button type="button" onClick={() => openEditor("location", location)} className={menuItemClass}>Edit</button>
                          {!location.is_default && (
                            <>
                              <button type="button" onClick={() => makeDefaultLocation(location)} className={menuItemClass}>Make default</button>
                              <button type="button" onClick={() => setDeleteTarget({ id: location.id, kind: "location", label: location.name })} className={`${menuItemClass} text-red-700`}>Delete</button>
                            </>
                          )}
                        </ActionMenu>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {activeTab === "team" && isAdmin && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-stone-200 bg-white">
                <div className="border-b border-stone-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-stone-950">Team members</h2>
                  <p className="mt-0.5 text-xs text-stone-500">Admins manage settings; staff can run inventory workflows.</p>
                </div>
                <ul className="divide-y divide-stone-100">
                  {team.map((profile) => (
                    <li key={profile.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-800">{profile.full_name || "Unnamed member"}</p>
                        {profile.id === me?.id && <p className="text-xs text-stone-500">Current account</p>}
                      </div>
                      {profile.id === me?.id ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">{profile.role}</span>
                      ) : (
                        <select
                          value={profile.role}
                          disabled={saving}
                          onChange={(event) => changeRole(profile, event.target.value as Role)}
                          aria-label={`Role for ${profile.full_name}`}
                          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs capitalize"
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-stone-200 bg-white">
                <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-950">Invited emails</h2>
                    <p className="mt-0.5 text-xs text-stone-500">Only invited addresses can create staff accounts.</p>
                  </div>
                  <button type="button" onClick={() => openEditor("invite")} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">Invite</button>
                </div>
                {invites.length === 0 ? (
                  <EmptyState title="No pending invitations" description="Add an email when a new team member needs access." />
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {invites.map((invite) => (
                      <li key={invite.email} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="truncate text-sm text-stone-800">{invite.email}</span>
                        <ActionMenu label={`Actions for ${invite.email}`}>
                          <button type="button" onClick={() => setDeleteTarget({ id: invite.email, kind: "invite", label: invite.email })} className={`${menuItemClass} text-red-700`}>Remove invitation</button>
                        </ActionMenu>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {!isAdmin && !loading && (
        <p className="mt-4 text-xs text-stone-500">Catalog and location changes require an administrator.</p>
      )}

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editorTitle}
        description={editor?.kind === "invite" ? "Allow a new staff account to sign up" : "Changes are used across inventory workflows"}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setEditor(null)} disabled={saving} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={saveEditor} disabled={saving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
          </>
        }
      >
        {editor && (
          <div className="space-y-4">
            {editor.kind === "invite" ? (
              <div>
                <label htmlFor="invite-email" className={labelClass}>Email address</label>
                <input id="invite-email" type="email" autoFocus className={inputClass} value={editor.email} onChange={(event) => setEditor((current) => current ? { ...current, email: event.target.value } : current)} placeholder="staff@example.com" />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="editor-name" className={labelClass}>Name</label>
                  <input id="editor-name" autoFocus className={inputClass} value={editor.name} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} />
                </div>
                {editor.kind === "supplier" && (
                  <>
                    <div>
                      <label htmlFor="supplier-phone" className={labelClass}>Phone</label>
                      <input id="supplier-phone" type="tel" className={inputClass} value={editor.phone} onChange={(event) => setEditor((current) => current ? { ...current, phone: event.target.value } : current)} />
                    </div>
                    <div>
                      <label htmlFor="supplier-address" className={labelClass}>Address</label>
                      <textarea id="supplier-address" rows={3} className={inputClass} value={editor.address} onChange={(event) => setEditor((current) => current ? { ...current, address: event.target.value } : current)} />
                    </div>
                  </>
                )}
              </>
            )}
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={runDelete}
        busy={saving}
        title={`Remove ${deleteTarget?.label ?? "record"}?`}
        description={
          deleteTarget?.kind === "category"
            ? "Products will remain, but this category will be removed from them."
            : "This record will be removed from future selections. Historical inventory data is protected."
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
