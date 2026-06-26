window.MXC_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteUrl: "https://mxcwedding.com",
  guestContentRefreshMinutes: 15,
  chatEndpoint: ""
});

window.addEventListener("load", () => {
  const isGuest = document.body.classList.contains("guest-site");
  const isPlanner = document.body.classList.contains("planner-site");
  if (!isGuest && !isPlanner) return;

  function addScript(src, marker) {
    if (document.querySelector(`script[data-${marker}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.dataset[marker.replace(/-([a-z])/g, (_match, char) => char.toUpperCase())] = "true";
    document.body.appendChild(script);
  }

  addScript("wedding-chat.js", "mxc-chat");
  if (isGuest) {
    addScript("guest-children-note.js", "mxc-children-note");
    addScript("wedding-chat-family.js", "mxc-family-chat");
  }
});
