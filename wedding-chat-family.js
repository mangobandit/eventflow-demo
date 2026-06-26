(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const ANSWER = "Yes, children are very welcome. We’ll provide some things to help keep them entertained, and there will be people nearby to keep a friendly eye on them. Parents and guardians are still responsible for their own children throughout the celebration, so please keep an eye on them as you normally would.";

  function isChildrenQuestion(text) {
    return /\b(child|children|kid|kids|baby|babies|toddler|toddlers|family|families)\b/i.test(text);
  }

  function addMessage(log, text, type) {
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function wire(panel) {
    if (!panel || panel.dataset.childrenChatReady) return;
    panel.dataset.childrenChatReady = "true";
    const form = panel.querySelector(".chat-form");
    const input = panel.querySelector("textarea");
    const log = panel.querySelector(".chat-log");
    const chips = panel.querySelector(".chat-chips");
    if (!form || !input || !log) return;

    form.addEventListener("submit", (event) => {
      const text = input.value.trim();
      if (!isChildrenQuestion(text)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      addMessage(log, text, "user");
      addMessage(log, ANSWER, "bot");
    }, true);

    if (chips && !chips.querySelector('[data-child-chip="true"]')) {
      const button = document.createElement("button");
      button.className = "chat-chip";
      button.type = "button";
      button.dataset.childChip = "true";
      button.textContent = "Can children come?";
      button.addEventListener("click", () => {
        input.value = "Can children come?";
        form.requestSubmit();
      });
      chips.appendChild(button);
    }
  }

  const observer = new MutationObserver(() => wire(document.querySelector(".chat-panel")));
  observer.observe(document.body, { childList: true, subtree: true });
  wire(document.querySelector(".chat-panel"));
})();
