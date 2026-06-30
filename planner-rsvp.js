(() => {
  "use strict";

  function addScript(src, marker) {
    if (document.querySelector(`script[data-${marker}]`)) return null;
    const script = document.createElement("script");
    script.src = src;
    script.dataset[marker.replace(/-([a-z])/g, (_match, char) => char.toUpperCase())] = "true";
    document.body.appendChild(script);
    return script;
  }

  const config = window.MXC_CONFIG || {};
  const hasSupabaseSettings = Boolean(config.supabaseUrl || config.supabaseAnonKey);
  const access = hasSupabaseSettings ? null : addScript("planner-access.js", "mxc-access");
  const loadPlannerExtras = () => {
    addScript("planner-extra-tasks.js", "mxc-extra-tasks");
    addScript("planner-checkin.js", "mxc-checkin");
    addScript("planner-honeymoon.js", "mxc-honeymoon");
  };

  if (access) access.addEventListener("load", loadPlannerExtras);
  else loadPlannerExtras();
})();
