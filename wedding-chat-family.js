(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const FAQ_ANSWERS = [
    {
      test: /\b(transport|bus|buses|shuttles?|pick[\s-]*ups?)\b/i,
      answer: "Transport will not be provided for either wedding. Please arrange your own travel to and from the venue."
    },
    {
      test: /getting home|get home|go home|travel home|journey home|return journey|ride home|taxi home|transfer home|drive home|journey back|getting back|get back|taxi after|transfer after|leave the venue|leave the wedding/i,
      answer: "Both celebrations finish at 01:00. Arrange your return journey before the wedding and agree a collection point with your driver. Your accommodation may be able to help you book a taxi or private transfer."
    },
    {
      test: /diet(?:ary)?|allerg(?:y|ies|ic)|coeliac|celiac|gluten|dairy[- ]?free|vegan|vegetarian|halal|kosher|food intolerance/i,
      answer: "Please let Matt or Cara know about any dietary requirements or allergies."
    },
    {
      test: /accessib(?:le|ility)|access needs|step[- ]?free|wheelchair|mobility|disabled|disabilit(?:y|ies)|close drop[- ]?off/i,
      answer: "The venue is wheelchair friendly."
    },
    {
      test: /parking|park (?:my |our |the )?car|car park/i,
      answer: "Parking is available at both venues. Use the map link in your wedding details, allow time to park and reach the ceremony, and arrive between 16:15 and 16:40."
    },
    {
      test: /\bdirections?\b|\bmaps?\b|venue address|wedding address|address.*(?:finca|mission|venue|wedding|spain|africa)|(?:finca|mission|venue|wedding).*address|where is (?:the )?(?:finca|mission|venue|wedding)|venue location|how (?:do|can) (?:i|we) get (?:there|to (?:the )?(?:venue|wedding|finca|mission))/i,
      answer: "Spain: Finca Mesa Jardín, Carretera Arcos de la Frontera–El Bosque, km 11, 11630 Arcos de la Frontera, Cádiz, Spain. The final access lane is 1.5 km from the main road at km 11. South Africa: Mission House, 39 Currys Post Road, Howick, 3290, KwaZulu-Natal, South Africa. Use the Directions link in your wedding details to plan your journey."
    },
    {
      test: /\b(rsvp|check\s*-?\s*in|confirm|confirmation|invite|invitation)\b/i,
      answer: "Matt and Cara will send your guest check in link a few days before the wedding."
    },
    {
      test: /\b(child|children|kid|kids|baby|babies|toddler|toddlers|family|families)\b/i,
      answer: "Yes, children are very welcome. We’ll provide some things to help keep them entertained, and there will be people nearby to keep a friendly eye on them. Parents and guardians are still responsible for their own children throughout the celebration, so please keep an eye on them as you normally would."
    },
    {
      test: /same location|one location|different location|move venue|moving venue/i,
      answer: "Yes, everything is planned around the same venue. Once you arrive, you can settle in and enjoy the ceremony, food, drinks and celebration without moving between locations."
    },
    {
      test: /how early|arrive early|arrival time|early can i arrive/i,
      answer: "Guest arrival is 16:15 to 16:40. Welcome drinks and soft drinks will be available as guests arrive before the ceremony. Drinks reception and canapes run from 17:20 to 18:45, and the bar opens fully afterwards."
    },
    {
      test: /open bar|bar|drinks|paid bar|cash bar/i,
      answer: "Welcome drinks and soft drinks will be available as guests arrive before the ceremony. Drinks reception and canapes run from 17:20 to 18:45, and the bar opens fully afterwards so guests can get drinks swiftly for the evening."
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
      answer: "For both weddings, guest arrival is 16:15 to 16:40, guests are seated from 16:45, and the ceremony runs from 17:00 to 17:20. Drinks reception and canapes run from 17:20 to 18:45, dinner and speeches run from 19:00 to 21:00, cake cutting is from 21:00, the first dance is at 22:00, and drinks and dancing continue until 01:00."
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
