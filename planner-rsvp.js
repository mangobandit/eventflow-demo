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

  const access = addScript("planner-access.js", "mxc-access");
  const loadPlannerExtras = () => {
    addScript("planner-extra-tasks.js", "mxc-extra-tasks");
    addScript("planner-honeymoon.js", "mxc-honeymoon");
  };

  if (access) access.addEventListener("load", loadPlannerExtras);
  else loadPlannerExtras();
})();
