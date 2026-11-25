const plannerSeatColours = (() => {
  const namedChoices = [
    ["beef", "Beef", ["beef", "beef meal"]],
    ["chicken", "Chicken", ["chicken", "chicken meal"]],
    ["fish", "Fish", ["fish", "fish meal"]],
    ["vegetarian", "Vegetarian", ["vegetarian", "vegetarian meal", "veggie"]],
    ["vegan", "Vegan", ["vegan", "vegan meal"]],
    ["plant", "Plant-based", ["plant based", "plant-based"]],
    ["pescatarian", "Pescatarian", ["pescatarian", "pescetarian"]],
    ["childrens", "Children’s meal", ["children's meal", "child meal", "kids meal", "kid's meal", "kids' meal"]]
  ];
  const common = new Map(namedChoices.flatMap(([key, label, names]) => names.map(name => [name, { key, label }])));
  const preferenceKeys = new Set(["vegetarian", "vegan", "plant", "pescatarian"]);
  const custom = ["custom-0", "custom-1", "custom-2", "custom-3", "custom-4", "custom-5", "custom-6", "custom-7"];
  const noMeal = { key: "unrecorded", colour: "unrecorded", label: "", dietary: false, preference: false, child: false };

  function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }

  function normalize(value) {
    return value.toLowerCase().replaceAll("’", "'");
  }

  function guestChoice(person, choice) {
    const meal = clean(choice);
    const note = clean(person.dietary);
    const noteKey = normalize(note);
    const named = common.get(normalize(meal));
    const dietChoice = common.get(noteKey);
    const preference = !meal && Boolean(dietChoice && preferenceKeys.has(dietChoice.key));
    const selected = named || (meal ? { key: `meal:${normalize(meal)}`, label: meal } : preference ? dietChoice : noMeal);
    const dietary = Boolean(note && !/^(none|no|no restrictions|no dietary requirements|n\/?a|[-–—]+)\.?$/.test(noteKey));
    return { ...selected, dietary, preference, child: person.is_child === true };
  }

  function choiceColours(keys) {
    const assigned = new Map();
    const used = new Set();
    const available = [...custom, ...namedChoices.map(([key]) => key).filter(key => !keys.includes(key))];
    for (const key of keys.filter(key => key.startsWith("meal:")).sort()) {
      let hash = 0;
      for (const char of key) hash = (Math.imul(31, hash) + char.codePointAt(0)) >>> 0;
      const base = hash % custom.length;
      const ordered = [...available.slice(base), ...available.slice(0, base)];
      const colour = ordered.find(item => !used.has(item)) || custom[base];
      assigned.set(key, colour);
      used.add(colour);
    }
    return assigned;
  }

  function build(roster, mealRows) {
    const rows = mealRows instanceof Map ? mealRows : new Map((mealRows || []).map(row => [row.guest_id, row]));
    const entries = new Map(roster.map(person => [person.id, guestChoice(person, rows.get(person.id)?.choice)]));
    const groups = new Map();
    for (const detail of entries.values()) {
      const previous = groups.get(detail.key);
      if (!previous) groups.set(detail.key, { label: detail.label, preference: detail.preference });
      else previous.preference &&= detail.preference;
    }
    const colours = choiceColours([...groups.keys()]);
    const colourFor = key => colours.get(key) || key;
    for (const detail of entries.values()) detail.colour = colourFor(detail.key);

    const meals = [...groups].filter(([key]) => key !== "unrecorded")
      .sort(([, a], [, b]) => a.label.localeCompare(b.label))
      .map(([key, detail]) => `<li><span class="seating-meal-swatch" data-seat-meal="${colourFor(key)}" aria-hidden="true"></span>${escapeHtml(detail.label)}${detail.preference ? " preference" : ""}</li>`);
    if (groups.has("unrecorded") || !groups.size) meals.push('<li><span class="seating-meal-swatch" data-seat-meal="unrecorded" aria-hidden="true"></span>No meal recorded</li>');
    const legend = `<div class="seating-meal-legend" aria-label="Seat colour key"><strong>Seat key</strong><ul>
      ${meals.join("")}
      <li><span class="seating-key-badge is-child" aria-hidden="true">C</span>Child</li>
      <li><span class="seating-key-badge is-dietary" aria-hidden="true">D</span>Dietary note</li>
    </ul></div>`;
    return { seat: person => entries.get(person?.id) || noMeal, legend };
  }

  return { build };
})();
