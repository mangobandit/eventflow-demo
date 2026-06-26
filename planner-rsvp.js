(() => {
  "use strict";
  if (document.querySelector('script[data-mxc-access]')) return;
  const script = document.createElement("script");
  script.src = "planner-access.js";
  script.dataset.mxcAccess = "true";
  document.body.appendChild(script);
})();
