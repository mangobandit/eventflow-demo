(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const ANSWER = "Matt and Cara will send your guest check in link a few days before the wedding.";
  const TRANSPORT_ANSWER = "Transport will not be provided for either wedding. Please arrange your own travel to and from the venue.";

  function replaceVisibleText(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const next = node.nodeValue.replace(/RSVP/g, "Guest Check In").replace(/rsvp/g, "check in");
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
    input.placeholder = input.placeholder.replace(/RSVP/g, "guest check in");
    form.addEventListener("submit", (event) => {
      const text = input.value.trim();
      const isTransportQuestion = /\b(transport|bus|buses|shuttles?|pick[\s-]*ups?)\b/i.test(text);
      if (!isTransportQuestion && /diet(?:ary)?|allerg(?:y|ies|ic)|coeliac|celiac|gluten|dairy[- ]?free|vegan|vegetarian|halal|kosher|food intolerance|accessib(?:le|ility)|access needs|step[- ]?free|wheelchair|mobility|disabled|disabilit(?:y|ies)|close drop[- ]?off|parking|park (?:my |our |the )?car|car park|getting home|get home|go home|travel home|journey home|return journey|ride home|taxi home|transfer home|drive home|journey back|getting back|get back|taxi after|transfer after|leave the venue|leave the wedding/i.test(text)) return;
      if (!isTransportQuestion && /\bdirections?\b|\bmaps?\b|venue address|wedding address|address.*(?:finca|mission|venue|wedding|spain|africa)|(?:finca|mission|venue|wedding).*address|where is (?:the )?(?:finca|mission|venue|wedding)|venue location|how (?:do|can) (?:i|we) get (?:there|to (?:the )?(?:venue|wedding|finca|mission))/i.test(text)) return;
      if (!isTransportQuestion && !/\b(rsvp|check\s*-?\s*in|confirm|confirmation|invite|invitation)\b/i.test(text)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      addMessage(log, text, "user");
      addMessage(log, isTransportQuestion ? TRANSPORT_ANSWER : ANSWER, "bot");
    }, true);
  }

  const observer = new MutationObserver(() => wire(document.querySelector(".chat-panel")));
  observer.observe(document.body, { childList: true, subtree: true });
  wire(document.querySelector(".chat-panel"));
})();
