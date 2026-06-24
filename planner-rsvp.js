(() => {
  "use strict";
  import("./planner-access.js").catch((error) => {
    console.error("Could not open the couple portal", error);
  });
})();
