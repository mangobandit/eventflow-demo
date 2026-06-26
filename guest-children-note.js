(() => {
  "use strict";

  if (!document.body.classList.contains("guest-site")) return;

  const CHILDREN_NOTE = "Children are very welcome. We will provide things to help keep them entertained, and there will be people nearby to keep a friendly eye on them, but parents and guardians remain responsible for their children throughout the celebration.";

  const FAQS = [
    {
      key: "children",
      question: "Can children come?",
      answer: CHILDREN_NOTE
    },
    {
      key: "same-location",
      question: "Is everything in the same location?",
      answer: "Yes. The ceremony, food, drinks and celebration are all planned around the same venue, so once you arrive you can settle in and enjoy the day without moving between locations."
    },
    {
      key: "parking",
      question: "Is there parking at the venue?",
      answer: "Yes, there will be parking available at the venue. We will share any final parking or arrival notes closer to the wedding date."
    },
    {
      key: "arrival-time",
      question: "How early can I arrive?",
      answer: "You may arrive up to two hours before the official start time if you need to. Please note that the bar will remain closed until the official kick-off time, so arriving early is mainly for settling in and avoiding a rush."
    },
    {
      key: "bar",
      question: "Will there be an open bar?",
      answer: "Yes, the bar will be hosted up to a certain time. After that point, any extra drinks will be for guests' own account. We will make the final bar timing clear on the day."
    },
    {
      key: "indoors-outdoors",
      question: "Is the wedding indoors or outdoors?",
      answer: "The wedding has a country/Rodeo feel and is planned as an outdoor celebration. If the weather turns, there will be cover under a tent or suitable shelter so the day can keep flowing comfortably."
    },
    {
      key: "gifts",
      question: "What gifts should I bring?",
      answer: "Your presence is the main thing. If you would like to give a gift, a cash or EFT contribution is most helpful and very appreciated. We can accept EUR or ZAR; please message Matt or Cara privately for the right banking details."
    },
    {
      key: "timing",
      question: "What are the timings for the day?",
      answer: "We will keep the day running with clear start and stop times, so please arrive promptly and avoid being late. If you want a drink before the ceremony, please grab it before the bar closes for the ceremony start. Final timings will be shared closer to the day."
    },
    {
      key: "food",
      question: "What kind of food will there be?",
      answer: "Expect a Western-inspired feast: BBQ and braai-style meats, with much of the food cooked over open fire. There will be options for lighter grazers as well as those who want something more hearty."
    },
    {
      key: "expect",
      question: "What can I expect on the day?",
      answer: "Food, drinks, laughs and a relaxed Rodeo-style celebration. Depending on which wedding you are attending, there will be small Western-inspired games and entertainment, such as horseshoe toss and other fun touches to keep the day moving."
    },
    {
      key: "photos-online",
      question: "Can I take photos or post online?",
      answer: "You are welcome to take a few personal photos, but please do not post the day publicly online without our permission. This is a private, intimate celebration and we have invested in a professional photography team. We will also use a private social wall, Walls.io, so guests can share moments in a more controlled and private way."
    },
    {
      key: "walls-io",
      question: "What is Walls.io?",
      answer: "Walls.io is a private social media wall for the wedding. Instead of everyone posting publicly, guests can share selected photos and messages into one private wedding feed. It lets us collect the fun moments while keeping the day more intimate and controlled. We will share the details closer to the time."
    }
  ];

  function addGuestFaqs() {
    const faqList = document.getElementById("faq-list");
    if (!faqList) return;
    [...FAQS].reverse().forEach((item) => {
      if (faqList.querySelector(`[data-extra-faq="${item.key}"]`)) return;
      const details = document.createElement("details");
      details.dataset.extraFaq = item.key;
      if (item.key === "children") details.dataset.childrenFaq = "true";
      details.innerHTML = `<summary>${item.question}</summary><p>${item.answer}</p>`;
      faqList.prepend(details);
    });
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
    addGuestFaqs();
    addChildrenGuestNote();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
