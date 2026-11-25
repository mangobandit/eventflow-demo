function bindPlannerNavigation() {
  const nav = document.querySelector(".planner-nav");
  const expand = document.getElementById("planner-nav-all");
  const sections = Array.from(nav.querySelectorAll(".planner-nav-section"));

  function syncExpandLabel() {
    const expanded = sections.every(section => section.open);
    expand.setAttribute("aria-expanded", String(expanded));
    expand.querySelector("[data-nav-all-label]").textContent = expanded ? "Collapse all sections" : "Show all features";
  }

  expand.addEventListener("click", () => {
    const open = sections.some(section => !section.open);
    sections.forEach(section => { section.open = open; });
    syncExpandLabel();
  });
  sections.forEach(section => section.addEventListener("toggle", syncExpandLabel));
  syncExpandLabel();
}

function updatePlannerNavigation(view) {
  const nav = document.querySelector(".planner-nav");
  let currentSection = null;
  nav.querySelectorAll("button[data-view]").forEach(button => {
    const current = button.dataset.view === view;
    button.classList.toggle("active", current);
    if (current) {
      button.setAttribute("aria-current", "page");
      currentSection = button.closest(".planner-nav-section");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  nav.querySelectorAll(".planner-nav-section").forEach(section => {
    section.dataset.active = String(section === currentSection);
  });
  if (currentSection) currentSection.open = true;
}
