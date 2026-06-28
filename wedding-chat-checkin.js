(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const ANSWER = "Use the Guest Check-In button on the site. It is our 24-hour / day-before confirmation so we can finalise who is still coming, transport, food and any last-minute notes for your household.";

  function replaceVisibleText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const next = node.nodeValue.replace(/RSVP/g, "Guest Check-In").replace(/rsvp/g, "check-in");
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function addMessage(log, text, type) {
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function wire(panel) {
    if (!panel) return;
    replaceVisibleText(panel);
    if (panel.dataset.checkinChatReady) return;
    panel.dataset.checkinChatReady = "true";
    const form = panel.querySelector(".chat-form");
    const input = panel.querySelector("textarea");
    const log = panel.querySelector(".chat-log");
    if (!form || !input || !log) return;
    input.placeholder = input.placeholder.replace(/RSVP/g, "check-in");
    form.addEventListener("submit", (event) => {
      const text = input.value.trim();
      if (!/\b(rsvp|check\s*-?\s*in|confirm|confirmation)\b/i.test(text)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      addMessage(log, text, "user");
      addMessage(log, ANSWER, "bot");
    }, true);
  }

  const observer = new MutationObserver(() => wire(document.querySelector(".chat-panel")));
  observer.observe(document.body, { childList: true, subtree: true });
  wire(document.querySelector(".chat-panel"));
})();
