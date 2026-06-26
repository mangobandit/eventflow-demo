window.MXC_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteUrl: "https://mxcwedding.com",
  guestContentRefreshMinutes: 15,
  chatEndpoint: ""
});

window.addEventListener("load", () => {
  const ok = document.body.classList.contains("guest-site") || document.body.classList.contains("planner-site");
  if (!ok || document.querySelector('script[data-mxc-chat]')) return;
  const script = document.createElement("script");
  script.src = "wedding-chat.js";
  script.dataset.mxcChat = "true";
  document.body.appendChild(script);
});
