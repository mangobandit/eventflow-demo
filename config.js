window.MXC_CONFIG = Object.freeze({
  supabaseUrl: "https://uwupepywyldwmsktvxdt.supabase.co",
  supabaseAnonKey: "sb_publishable_PYc6vx29OsEUCwEGFdVtqg_woEuCII1",
  siteUrl: "https://mxcwedding.com",
  guestContentRefreshMinutes: 15,
  chatEndpoint: ""
});

window.addEventListener("load", () => {
  const isGuest = document.body.classList.contains("guest-site");
  const isPlanner = document.body.classList.contains("planner-site");
  if (!isGuest && !isPlanner) return;

  const ASSET_VERSION = "20260704-timings";

  function versioned(src) {
    if (/^https?:\/\//i.test(src)) return src;
    return `${src}?v=${ASSET_VERSION}`;
  }

  function addScript(src, marker) {
    if (document.querySelector(`script[data-${marker}]`)) return;
    const script = document.createElement("script");
    script.src = versioned(src);
    script.dataset[marker.replace(/-([a-z])/g, (_match, char) => char.toUpperCase())] = "true";
    document.body.appendChild(script);
  }

  addScript("wedding-chat.js", "mxc-chat");
  if (isGuest) {
    addScript("guest-children-note.js", "mxc-children-note");
    addScript("wedding-chat-family.js", "mxc-family-chat");
    addScript("wedding-chat-checkin.js", "mxc-checkin-chat");
  }
});
