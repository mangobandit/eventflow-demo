(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const FAQ_ANSWERS = [
    {
      test: /\b(child|children|kid|kids|baby|babies|toddler|toddlers|family|families)\b/i,
      answer: "Yes, children are very welcome. We’ll provide some things to help keep them entertained, and there will be people nearby to keep a friendly eye on them. Parents and guardians are still responsible for their own children throughout the celebration, so please keep an eye on them as you normally would."
    },
    {
      test: /same location|one location|different location|move venue|moving venue/i,
      answer: "Yes, everything is planned around the same venue. Once you arrive, you can settle in and enjoy the ceremony, food, drinks and celebration without moving between locations."
    },
    {
      test: /parking|park car|car park/i,
      answer: "Yes, there will be parking available at the venue. We’ll share any final parking or arrival notes closer to the wedding date."
    },
    {
      test: /how early|arrive early|arrival time|early can i arrive/i,
      answer: "You may arrive up to two hours before the official start time if you need to. Welcome drinks and soft drinks will be available before the reception, and the bar will open fully afterwards. We will do our best to make sure everyone gets a drink swiftly once the bar opens."
    },
    {
      test: /open bar|bar|drinks|paid bar|cash bar/i,
      answer: "Welcome drinks and soft drinks will be available before the reception. The bar will open fully after the reception, and we will do our best to make sure guests get their drinks swiftly once it opens."
    },
    {
      test: /indoors|outdoors|inside|outside|tent|rain|weather/i,
      answer: "The wedding has a country/Rodeo feel and is planned as an outdoor celebration. If the weather turns, there will be cover under a tent or suitable shelter so the day can keep flowing comfortably."
    },
    {
      test: /gift|gifts|cash|eft|bank|banking|present|registry/i,
      answer: "Your presence is the main thing. If you would like to give a gift, a cash or EFT contribution is most helpful and very appreciated. We can accept EUR or ZAR; please message Matt or Cara privately for banking details."
    },
    {
      test: /timing|times|schedule|late|start|ceremony time|what time/i,
      answer: "We will keep the day running with clear start and stop times, so please arrive promptly and avoid being late. Welcome drinks and soft drinks will be available before the reception, and the bar will open fully afterwards. Final timings will be shared closer to the day."
    },
    {
      test: /food|eat|meal|bbq|braai|meat|vegetarian|graz/i,
      answer: "Expect a Western inspired feast: BBQ and braai style meats, with much of the food cooked over open fire. There will be options for lighter grazers as well as those who want something more hearty."
    },
    {
      test: /expect|what happens|on the day|games|entertainment|horseshoe|horse shoe/i,
      answer: "Expect food, drinks, laughs and a relaxed Rodeo style celebration. Depending on which wedding you are attending, there will be small Western inspired games and entertainment, such as horseshoe toss and other fun touches to keep the day moving."
    },
    {
      test: /photo|photos|post|instagram|online|social|video|walls|walls\.io/i,
      answer: "You’re welcome to take a few personal photos, but please don’t post the day publicly online without our permission. This is a private, intimate celebration and we’ve invested in a professional photography team. We’ll also use Walls.io, a private wedding social wall where guests can share selected photos and messages into one private feed instead of posting everything publicly."
    }
  ];

  function findAnswer(text) {
    return FAQ_ANSWERS.find((item) => item.test.test(text))?.answer || null;
  }

  function addMessage(log, text, type) {
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function wire(panel) {
    if (!panel || panel.dataset.extraFaqChatReady) return;
    panel.dataset.extraFaqChatReady = "true";
    const form = panel.querySelector(".chat-form");
    const input = panel.querySelector("textarea");
    const log = panel.querySelector(".chat-log");
    const chips = panel.querySelector(".chat-chips");
    if (!form || !input || !log) return;

    form.addEventListener("submit", (event) => {
      const text = input.value.trim();
      const answer = findAnswer(text);
      if (!answer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      addMessage(log, text, "user");
      addMessage(log, answer, "bot");
    }, true);

    if (chips && !chips.querySelector('[data-extra-faq-chip="true"]')) {
      ["Can children come?", "Is there parking?", "How do drinks work?", "Can I post photos online?"].forEach((label) => {
        const button = document.createElement("button");
        button.className = "chat-chip";
        button.type = "button";
        button.dataset.extraFaqChip = "true";
        button.textContent = label;
        button.addEventListener("click", () => {
          input.value = label;
          form.requestSubmit();
        });
        chips.appendChild(button);
      });
    }
  }

  const observer = new MutationObserver(() => wire(document.querySelector(".chat-panel")));
  observer.observe(document.body, { childList: true, subtree: true });
  wire(document.querySelector(".chat-panel"));
})();
