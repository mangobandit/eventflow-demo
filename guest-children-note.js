(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const CHILDREN_NOTE = "Children are very welcome. We will provide things to help keep them entertained, and there will be people nearby to keep a friendly eye on them, but parents and guardians remain responsible for their children throughout the celebration.";

  function addChildrenFaq() {
    const faqList = document.getElementById("faq-list");
    if (!faqList || faqList.querySelector('[data-children-faq="true"]')) return;
    const details = document.createElement("details");
    details.dataset.childrenFaq = "true";
    details.innerHTML = `<summary>Can children come?</summary><p>${CHILDREN_NOTE}</p>`;
    const rodeo = faqList.querySelector('[data-rodeo-faq="true"]');
    if (rodeo?.nextSibling) faqList.insertBefore(details, rodeo.nextSibling);
    else faqList.prepend(details);
  }

  function addChildrenGuestNote() {
    const practicalGrid = document.querySelector(".practical-grid");
    if (!practicalGrid || practicalGrid.querySelector('[data-children-note="true"]')) return;
    const article = document.createElement("article");
    article.dataset.childrenNote = "true";
    article.innerHTML = `<span class="practical-icon">♡</span><h3>Children</h3><p>${CHILDREN_NOTE}</p>`;
    practicalGrid.appendChild(article);
  }

  function install() {
    addChildrenFaq();
    addChildrenGuestNote();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
