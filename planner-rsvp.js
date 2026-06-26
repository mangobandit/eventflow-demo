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
  if (access) access.addEventListener("load", () => addScript("planner-extra-tasks.js", "mxc-extra-tasks"));
  else addScript("planner-extra-tasks.js", "mxc-extra-tasks");
})();
