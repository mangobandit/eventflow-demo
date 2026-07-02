/* One-time starter checklist for the two-wedding plan. Runs after the planner
   is ready and writes through the normal save path, so seeded rows persist in
   the secure database (or the browser store in demo mode) instead of living
   only in memory. Rows are deduplicated by title against loaded data. */
(() => {
  "use strict";

  const APPLIED_KEY = "mxc-extra-planning-checklist-2026-06-26";
  let applying = false;

  async function applyExtras() {
    if (applying || localStorage.getItem(APPLIED_KEY) === "yes") return;
    applying = true;
    const pending = [];
    const exists = (table, value) => state.data[table].some((item) => String(item.title || "").toLowerCase() === String(value || "").toLowerCase());
    const addTask = (title, owner, celebration, category, priority, status, due_date, description, notes = "") => {
      if (!exists("tasks", title)) pending.push(["tasks", { title, owner, celebration, category, priority, status, due_date, description, notes }]);
    };
    const addBudget = (title, owner, celebration, category, currency, estimated, status, notes = "") => {
      if (!exists("budget_items", title)) pending.push(["budget_items", { title, owner, celebration, category, currency, estimated, deposit: 0, paid: 0, due_date: null, status, notes }]);
    };
    const addTimeline = (title, celebration, item_date, item_time, location, notes = "") => {
      if (!exists("timeline_items", title)) pending.push(["timeline_items", { title, owner: "shared", celebration, item_date, item_time, audience: "private", location, sort_order: 0, status: "outstanding", notes }]);
    };

    addTask("Decide South Africa travel dates", "shared", "south_africa", "Travel", "high", "outstanding", "2026-07-31", "Agree Matt and Cara's separate outbound dates and shared/individual return window.");
    addTask("Book Matt outbound flight: Spain to South Africa", "matt", "south_africa", "Travel", "high", "outstanding", "2026-08-15", "Matt to fly earlier to set up, meet suppliers and handle final planning on the ground.");
    addTask("Book Cara outbound flight: Spain to South Africa", "cara", "south_africa", "Travel", "high", "outstanding", "2026-08-15", "Cara to fly later after spending time with family in Spain.");
    addTask("Book Matt return flight: South Africa to Spain", "matt", "south_africa", "Travel", "high", "outstanding", "2026-08-31", "Confirm whether Matt returns before, with or after Cara after the SA wedding.");
    addTask("Book Cara return flight: South Africa to Spain", "cara", "south_africa", "Travel", "high", "outstanding", "2026-08-31", "Confirm Cara's return plan after the SA wedding and family commitments.");
    addTask("Compare flight routes and luggage rules", "shared", "south_africa", "Travel", "normal", "outstanding", "2026-07-31", "Compare Malaga, Seville, Jerez, Madrid or Lisbon routing; check wedding outfit carry-on and extra baggage rules.");
    addTask("Book extra luggage for wedding clothes", "shared", "south_africa", "Travel", "normal", "outstanding", "2026-10-15", "Plan suit, dresses, shoes, decor bits and anything fragile as carry-on or extra checked bags.");
    addTask("Travel insurance for Spain to South Africa trip", "shared", "south_africa", "Travel", "normal", "outstanding", "2026-09-01", "Cover flights, baggage, medical, cancellation and wedding items in transit.");
    addTask("Passport and document check", "shared", "south_africa", "Travel", "high", "outstanding", "2026-07-15", "Check passport validity, ID documents, bank cards and any travel document requirements.");
    addTask("Matt SA setup accommodation before Cara arrives", "matt", "south_africa", "Travel", "normal", "outstanding", "2026-09-30", "Book somewhere practical while Matt is in South Africa early for setup and supplier meetings.");
    addTask("Matt SA setup transport / car hire", "matt", "south_africa", "Travel", "normal", "outstanding", "2026-09-30", "Book car hire or transport for venue visits, supplier errands and airport pickups.");
    addTask("Cara family-time window in Spain", "cara", "south_africa", "Travel", "normal", "outstanding", "2026-08-31", "Agree how long Cara stays in Spain before flying to South Africa.");
    addTask("Create shared wedding packing list", "shared", "shared", "Travel", "normal", "outstanding", "2026-09-15", "Split clothes, rings, documents, decor, gifts, chargers, medicine and emergency items between bags.");
    addTask("Carry-on plan for dress, suit and rings", "shared", "shared", "Travel", "high", "outstanding", "2026-10-01", "Decide what never goes into checked luggage.");

    addTask("Set final RSVP deadline", "shared", "shared", "Guests", "high", "outstanding", "2026-07-15", "Choose deadlines for Spain and South Africa so catering, transport and seating can close cleanly.");
    addTask("Final Spain headcount to catering", "shared", "spain", "Catering", "high", "outstanding", "2026-09-10", "Send confirmed adults, kids, dietaries and supplier meals.");
    addTask("Final South Africa headcount to catering", "shared", "south_africa", "Catering", "high", "outstanding", "2026-11-20", "Send confirmed adults, kids, dietaries and supplier meals.");
    addTask("Master dietary and allergy list", "shared", "shared", "Catering", "high", "outstanding", "2026-09-01", "One clean list for both weddings covering allergies, no-red-meat, vegetarian, pescatarian, kids and special notes.");
    addTask("Spain seating plan", "shared", "spain", "Guests", "normal", "outstanding", "2026-09-20", "Build table groups and identify family/friend dynamics.");
    addTask("South Africa seating plan", "shared", "south_africa", "Guests", "normal", "outstanding", "2026-11-30", "Build table groups and identify family/friend dynamics.");
    addTask("Place cards and table names", "shared", "shared", "Stationery", "normal", "outstanding", "2026-09-25", "Decide Rodeo/Western table naming, place cards, menu cards and print quantities.");
    addTask("Wedding signage list", "shared", "shared", "Stationery", "normal", "outstanding", "2026-09-25", "Welcome sign, bar sign, seating chart, transport sign, bathroom sign, guestbook sign and unplugged ceremony sign if needed.");
    addTask("Guest information final update", "shared", "shared", "Guest guide", "normal", "outstanding", "2026-09-15", "Publish final dress code, travel, transport, weather, accommodation and arrival instructions.");

    addTask("Ceremony script", "shared", "shared", "Ceremony", "high", "outstanding", "2026-09-15", "Write the ceremony flow, readings, vows, ring moment, music cues and closing words.");
    addTask("Personal vows", "shared", "shared", "Ceremony", "normal", "outstanding", "2026-09-30", "Write, print and store final vows safely.");
    addTask("Choose readings", "shared", "shared", "Ceremony", "normal", "outstanding", "2026-09-15", "Choose who reads and what they read.");
    addTask("Officiant / celebrant confirmation", "shared", "shared", "Ceremony", "high", "outstanding", "2026-08-31", "Confirm who conducts each ceremony and what they need from you.");
    addTask("Wedding rings sizing and engraving", "shared", "shared", "Rings", "normal", "outstanding", "2026-08-31", "Confirm sizes, engravings, insurance and safe travel plan.");
    addTask("Ring handoff plan", "matt", "shared", "Ceremony", "normal", "outstanding", "2026-09-30", "Decide who carries rings at each ceremony and where they are stored before the ceremony.");

    addTask("Dress fitting schedule", "cara", "shared", "Attire", "high", "outstanding", "2026-08-31", "Schedule fittings, alterations, collection, steaming and travel packing for each dress.");
    addTask("Suit fitting schedule", "matt", "shared", "Attire", "high", "outstanding", "2026-08-31", "Schedule fittings, alterations, collection and packing for Matt and groomsmen.");
    addTask("Western outfit detail list", "shared", "shared", "Attire", "normal", "outstanding", "2026-09-01", "Boots, hats, belts, bolo ties, denim, leather, backup shirts and weather layers.");
    addTask("Hair and makeup trials", "cara", "shared", "Beauty", "normal", "outstanding", "2026-08-31", "Book trials, inspiration photos, timing and touch-up kit.");

    addTask("DJ music brief", "shared", "shared", "Music", "high", "outstanding", "2026-09-15", "Western music, BBQ/Rodeo energy, entrance songs, first dance, must-play and do-not-play list.");
    addTask("First dance decision", "shared", "shared", "Music", "normal", "outstanding", "2026-09-15", "Choose song, edit length and whether to rehearse.");
    addTask("Entrance and exit music", "shared", "shared", "Music", "normal", "outstanding", "2026-09-15", "Ceremony entrance, signing/background, exit and reception entrance tracks.");
    addTask("Speeches and MC running order", "matt", "shared", "Run sheet", "high", "outstanding", "2026-09-30", "Who speaks, when they speak, time limits, mic handoffs and thank-yous.");
    addTask("Family photo shot list", "shared", "shared", "Photo / video", "high", "outstanding", "2026-09-20", "List family combinations so portraits move quickly.");
    addTask("Photographer / videographer brief", "shared", "shared", "Photo / video", "normal", "outstanding", "2026-09-20", "Must-have moments, family sensitivities, details, Rodeo styling and golden-hour windows.");

    addTask("Spain transport manifest", "shared", "spain", "Transport", "high", "outstanding", "2026-09-20", "Names, pickup points, contact numbers, pickup times and return buses.");
    addTask("South Africa transport manifest", "shared", "south_africa", "Transport", "high", "outstanding", "2026-11-30", "Names, pickup points, contact numbers, pickup times and return buses.");
    addTask("Mission House room allocation", "shared", "south_africa", "Accommodation", "high", "outstanding", "2026-10-31", "Allocate rooms, arrival times, check-in details and who pays what.");
    addTask("Spain accommodation guide", "shared", "spain", "Accommodation", "normal", "outstanding", "2026-08-31", "Recommended areas, taxi notes and transport pickup clusters.");

    addTask("Weather and rain plan for Spain", "shared", "spain", "Production", "normal", "outstanding", "2026-09-20", "Backup ceremony spot, umbrellas, heaters/layers and furniture move plan.");
    addTask("Weather and rain plan for South Africa", "shared", "south_africa", "Production", "normal", "outstanding", "2026-11-30", "Summer storm plan, tent/lawn plan, umbrellas, generator and safe walkways.");
    addTask("Power, lighting and sound check", "shared", "shared", "Production", "high", "outstanding", "2026-09-15", "Confirm electricity, extension leads, generator, sound limits, mic checks and dancefloor lighting.");
    addTask("Supplier arrival schedule", "shared", "shared", "Vendors", "high", "outstanding", "2026-09-30", "One list of arrival times, setup windows, contact names and who manages each supplier.");
    addTask("Vendor meal plan", "shared", "shared", "Catering", "normal", "outstanding", "2026-09-30", "Photographer, videographer, DJ, coordinator, drivers and any setup crew meals.");
    addTask("Payment deadline tracker", "shared", "shared", "Budget", "high", "outstanding", "2026-07-31", "List every deposit, remaining balance, due date and payment method.");
    addTask("Contract and invoice folder", "shared", "shared", "Admin", "normal", "outstanding", "2026-07-31", "Store contracts, invoices, receipts, bank details and cancellation terms.");
    addTask("Wedding-day emergency kit", "shared", "shared", "Operations", "normal", "outstanding", "2026-09-30", "Painkillers, plasters, sewing kit, stain remover, tape, safety pins, tissues, chargers and snacks.");
    addTask("Cash float and tips", "matt", "shared", "Budget", "normal", "outstanding", "2026-09-30", "Prepare small cash for tips, emergency taxis, supplier extras and bar/driver issues.");
    addTask("Post-wedding cleanup and item collection", "shared", "shared", "Operations", "high", "outstanding", "2026-09-30", "Who collects decor, gifts, outfits, leftover drinks, signage and deposits after each wedding.");
    addTask("Thank-you message and photos follow-up", "shared", "shared", "After wedding", "low", "outstanding", "2027-01-15", "Thank guests, suppliers and family; track photo/video delivery and album choices.");

    addBudget("Matt Spain to South Africa flight", "matt", "south_africa", "Travel", "EUR", 900, "outstanding", "Estimate only. Matt likely travels earlier for setup." );
    addBudget("Cara Spain to South Africa flight", "cara", "south_africa", "Travel", "EUR", 900, "outstanding", "Estimate only. Cara likely travels later after family time in Spain." );
    addBudget("Matt South Africa to Spain return flight", "matt", "south_africa", "Travel", "EUR", 900, "outstanding", "Estimate only." );
    addBudget("Cara South Africa to Spain return flight", "cara", "south_africa", "Travel", "EUR", 900, "outstanding", "Estimate only." );
    addBudget("Extra baggage for wedding outfits", "shared", "south_africa", "Travel", "EUR", 300, "outstanding", "Estimate for dresses, suits, boots and fragile items." );
    addBudget("Travel insurance", "shared", "south_africa", "Travel", "EUR", 250, "outstanding", "Estimate for both of you." );
    addBudget("Matt SA setup accommodation", "matt", "south_africa", "Travel", "ZAR", 10000, "outstanding", "Estimate while Matt is out early setting up." );
    addBudget("Matt SA setup car hire", "matt", "south_africa", "Travel", "ZAR", 8000, "outstanding", "Estimate for supplier meetings and setup errands." );
    addBudget("Printing and signage", "shared", "shared", "Stationery", "EUR", 400, "outstanding", "Estimate for table plan, place cards, menus and signs." );
    addBudget("Emergency / contingency buffer", "shared", "shared", "Budget", "EUR", 1000, "outstanding", "Useful buffer for two weddings." );

    addTimeline("Provisional Matt early flight to South Africa", "south_africa", "2026-12-09", "12:00", "Spain to South Africa", "Placeholder date; update after booking." );
    addTimeline("Provisional Cara flight to South Africa", "south_africa", "2026-12-15", "12:00", "Spain to South Africa", "Placeholder date; update after booking." );
    addTimeline("Matt South Africa setup week", "south_africa", "2026-12-10", "09:00", "KZN / Mission House", "Supplier visits, venue setup, transport checks and errands." );
    addTimeline("Post-wedding return flight window", "south_africa", "2026-12-23", "12:00", "South Africa to Spain", "Placeholder return window; update after booking." );

    if (!pending.length) {
      localStorage.setItem(APPLIED_KEY, "yes");
      applying = false;
      return;
    }

    try {
      for (const [table, payload] of pending) {
        if (state.session?.token) {
          const saved = await plannerRpc("planner_save_entity", {
            p_session_token: state.session.token,
            p_table: table,
            p_record_id: null,
            p_payload: payload
          });
          state.data[table].push(saved);
        } else {
          const now = new Date().toISOString();
          state.data[table].push({ id: crypto.randomUUID(), ...payload, created_at: now, updated_at: now });
        }
      }
      if (!state.session?.token) {
        try {
          localStorage.setItem("mxc-planner-browser-v3", JSON.stringify(state.data));
        } catch (_error) {
          // Browser storage may be unavailable; the seeded rows still render.
        }
      }
      localStorage.setItem(APPLIED_KEY, "yes");
      renderAll();
      toast(`${pending.length} starter planning items added.`);
    } catch (error) {
      toast(error.message || "Could not add the starter checklist.", true);
    } finally {
      applying = false;
    }
  }

  document.addEventListener("mxc:planner-ready", applyExtras);
})();
