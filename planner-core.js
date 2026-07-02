"use strict";


  const config = window.MXC_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient);
  const state = {
    client: null,
    session: null,
    identity: null,
    owner: "shared",
    celebration: "all",
    view: "overview",
    editing: null,
    data: {
      tasks: [],
      budget_items: [],
      guests: [],
      vendors: [],
      timeline_items: [],
      content_blocks: [],
      honeymoon_items: []
    }
  };

  const PLANNER_VIEWS = ["overview", "tasks", "budget", "guests", "checkin", "vendors", "timeline", "publishing", "honeymoon"];
  const LOCAL_PLANNER_STORE = "mxc-planner-browser-v3";

  /* Fired once the planner shell is open and data is loaded (both the secure
     Supabase mode and the browser demo mode). Optional modules listen for it
     instead of polling for globals. */
  function announcePlannerReady() {
    document.dispatchEvent(new CustomEvent("mxc:planner-ready"));
  }

  const els = {
    authScreen: document.getElementById("auth-screen"),
    plannerShell: document.getElementById("planner-shell"),
    setupCard: document.getElementById("setup-card"),
    loginForm: document.getElementById("login-form"),
    loginUsername: document.getElementById("login-username"),
    loginPassword: document.getElementById("login-password"),
    authStatus: document.getElementById("auth-status"),
    loading: document.getElementById("planner-loading"),
    topbarTitle: document.getElementById("topbar-title"),
    topbarSubtitle: document.getElementById("topbar-subtitle"),
    syncState: document.getElementById("sync-state"),
    accountName: document.getElementById("account-name"),
    accountEmail: document.getElementById("account-email"),
    accountAvatar: document.getElementById("account-avatar"),
    modal: document.getElementById("entity-modal"),
    modalTitle: document.getElementById("modal-title"),
    modalClose: document.getElementById("modal-close"),
    entityForm: document.getElementById("entity-form"),
    toastRegion: document.getElementById("toast-region")
  };

  const STATUS_OPTIONS = [
    ["outstanding", "Outstanding"],
    ["pending", "Pending"],
    ["approved", "Approved"]
  ];
  const OWNER_OPTIONS = [["shared", "Shared"], ["matt", "Matt"], ["cara", "Cara"]];
  const CELEBRATION_OPTIONS = [["shared", "Shared / both"], ["spain", "Spain"], ["south_africa", "South Africa"]];

  const definitions = {
    tasks: {
      singular: "task",
      title: "Task",
      fields: [
        field("title", "Task", "text", { required: true, full: true, placeholder: "What needs to happen?" }),
        field("description", "Description", "textarea", { full: true }),
        field("owner", "Owner", "select", { options: OWNER_OPTIONS, default: () => state.owner }),
        field("celebration", "Wedding", "select", { options: CELEBRATION_OPTIONS, default: "shared" }),
        field("category", "Category", "text", { placeholder: "Venue, attire, legal…" }),
        field("priority", "Priority", "select", { options: [["normal", "Normal"], ["high", "High"], ["low", "Low"]], default: "normal" }),
        field("due_date", "Due date", "date"),
        field("status", "Status", "select", { options: STATUS_OPTIONS, default: "outstanding" }),
        field("notes", "Private notes", "textarea", { full: true })
      ]
    },
    budget_items: {
      singular: "cost",
      title: "Budget item",
      fields: [
        field("title", "Item", "text", { required: true, full: true }),
        field("owner", "Owner", "select", { options: OWNER_OPTIONS, default: () => state.owner }),
        field("celebration", "Wedding", "select", { options: CELEBRATION_OPTIONS, default: "shared" }),
        field("category", "Category", "text"),
        field("currency", "Currency", "select", { options: [["EUR", "Euro (€)"], ["ZAR", "South African rand (R)"]], default: "EUR" }),
        field("estimated", "Estimated total", "number", { step: "0.01" }),
        field("deposit", "Deposit", "number", { step: "0.01" }),
        field("paid", "Paid to date", "number", { step: "0.01" }),
        field("due_date", "Next payment date", "date"),
        field("status", "Status", "select", { options: STATUS_OPTIONS, default: "outstanding" }),
        field("notes", "Private notes", "textarea", { full: true })
      ]
    },
    guests: {
      singular: "guest",
      title: "Guest",
      fields: [
        field("name", "Guest name", "text", { required: true, full: true }),
        field("party_name", "Invitation / party", "text"),
        field("owner", "Planner owner", "select", { options: OWNER_OPTIONS, default: "shared" }),
        field("celebration", "Wedding", "select", { options: [["spain", "Spain"], ["south_africa", "South Africa"]], default: "spain" }),
        field("rsvp_status", "RSVP", "select", { options: [["yes", "Yes"], ["no", "No"], ["tbc", "TBC"], ["no_response", "No response"]], default: "no_response" }),
        field("check_in_status", "Check-in", "select", { options: [["not_checked_in", "Not checked in"], ["checked_in", "Checked in"], ["cant_make_it", "Can't make it"]], default: "not_checked_in" }),
        field("dietary", "Dietary notes", "textarea", { full: true }),
        field("transport", "Transport", "text", { placeholder: "Required, not required, TBC…" }),
        field("accommodation", "Accommodation", "text"),
        field("contact", "Contact details", "text", { full: true }),
        field("notes", "Private notes", "textarea", { full: true })
      ]
    },
    vendors: {
      singular: "vendor",
      title: "Vendor",
      fields: [
        field("name", "Supplier", "text", { required: true, full: true }),
        field("owner", "Owner", "select", { options: OWNER_OPTIONS, default: () => state.owner }),
        field("celebration", "Wedding", "select", { options: CELEBRATION_OPTIONS, default: "shared" }),
        field("category", "Category", "text"),
        field("contact_name", "Contact person", "text"),
        field("email", "Email", "email"),
        field("phone", "Phone", "tel"),
        field("currency", "Currency", "select", { options: [["EUR", "Euro (€)"], ["ZAR", "South African rand (R)"]], default: "EUR" }),
        field("quote_amount", "Quote amount", "number", { step: "0.01" }),
        field("next_action", "Next action", "text", { full: true }),
        field("due_date", "Action due", "date"),
        field("status", "Status", "select", { options: STATUS_OPTIONS, default: "outstanding" }),
        field("notes", "Private notes", "textarea", { full: true })
      ]
    },
    timeline_items: {
      singular: "milestone",
      title: "Timeline item",
      fields: [
        field("title", "Milestone / moment", "text", { required: true, full: true }),
        field("owner", "Owner", "select", { options: OWNER_OPTIONS, default: () => state.owner }),
        field("celebration", "Wedding", "select", { options: CELEBRATION_OPTIONS, default: "shared" }),
        field("item_date", "Date", "date", { required: true }),
        field("item_time", "Time", "time"),
        field("audience", "Audience", "select", { options: [["private", "Private planner"], ["guest", "Can be guest-facing"]], default: "private" }),
        field("location", "Location", "text"),
        field("sort_order", "Order", "number", { step: "1", default: 0 }),
        field("status", "Status", "select", { options: STATUS_OPTIONS, default: "outstanding" }),
        field("notes", "Notes", "textarea", { full: true })
      ]
    },
    honeymoon_items: {
      singular: "honeymoon item",
      title: "Honeymoon item",
      fields: [
        field("title", "Title", "text", { required: true, full: true, placeholder: "Task, place, flight leg, budget line…" }),
        field("kind", "Type", "select", { options: [["task", "Task"], ["place", "Saved place"], ["itinerary", "Itinerary stop"], ["flight", "Flight / transport"], ["budget", "Budget line"]], default: "task" }),
        field("detail", "Detail", "text", { placeholder: "City, area, route or day range" }),
        field("priority", "Priority", "select", { options: [["normal", "Normal"], ["high", "High"], ["low", "Low"]], default: "normal" }),
        field("status", "Status note", "text", { placeholder: "TBC, booked, shortlisted…" }),
        field("currency", "Currency", "select", { options: [["EUR", "Euro (€)"], ["ZAR", "South African rand (R)"], ["JPY", "Japanese yen (¥)"]], default: "EUR" }),
        field("amount", "Amount", "number", { step: "0.01" }),
        field("sort_order", "Order", "number", { step: "1", default: 0 }),
        field("done", "Done / booked", "checkbox", { full: true, default: false }),
        field("notes", "Notes", "textarea", { full: true })
      ]
    },
    content_blocks: {
      singular: "guest update",
      title: "Guest update",
      fields: [
        field("title", "Headline / question", "text", { required: true, full: true }),
        field("body", "Guest-facing answer", "textarea", { required: true, full: true }),
        field("slug", "Unique slug", "text", { placeholder: "Generated from title when blank" }),
        field("section", "Type", "select", { options: [["announcement", "Announcement"], ["faq", "FAQ"], ["travel", "Travel note"], ["stay", "Accommodation note"], ["general", "General"]], default: "announcement" }),
        field("country", "Applies to", "select", { options: [["both", "Both weddings"], ["spain", "Spain"], ["south_africa", "South Africa"]], default: "both" }),
        field("owner", "Planner owner", "select", { options: OWNER_OPTIONS, default: "shared" }),
        field("sort_order", "Display order", "number", { step: "1", default: 0 }),
        field("publish_at", "Publish from", "datetime-local"),
        field("published", "Published to guest site", "checkbox", { full: true, default: false })
      ]
    }
  };

  function field(name, label, type, options = {}) { return { name, label, type, ...options }; }

  /* The browser demo gate is only ever loaded when Supabase is intentionally
     unconfigured, so a public deployment cannot fall back to local access. */
  if (!config.supabaseUrl && !config.supabaseAnonKey) {
    window.addEventListener("load", () => {
      if (document.querySelector("script[data-mxc-access]")) return;
      const script = document.createElement("script");
      script.src = "planner-access.js?v=20260701-guest-portal-upgrade";
      script.dataset.mxcAccess = "true";
      document.body.appendChild(script);
    });
  }
