const plannerRegisters = (() => {
  let mealSession;
  let meals;
  let mealRequest;
  let mealError;

  function reset() {
    mealSession = null;
    meals = null;
    mealRequest = null;
    mealError = "";
  }

  function inProject(row, scope) {
    return row.celebration === scope || (row.celebration === "shared" && ["south_africa", "spain"].includes(scope));
  }

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderPayments(root, scope) {
    const due = today();
    const rows = state.data.budget_items.filter(row => inProject(row, scope))
      .sort((first, second) => compareDates(first.due_date, second.due_date) || first.title.localeCompare(second.title));
    const canInclude = rows.length || ["south_africa", "spain", "shared"].includes(scope);
    const payments = rows.map(row => {
      const remaining = balance(row);
      const paid = Number(row.paid || row.deposit || 0);
      const status = remaining === 0 ? (paid > 0 ? "Paid" : "No balance") :
        row.due_date && row.due_date < due ? "Overdue" : paid > 0 ? "Part paid" : "Due";
      return { row, remaining, paid, status };
    });
    const totals = new Map();
    for (const { row, remaining, paid, status } of payments) {
      const currency = row.currency || "EUR";
      const total = totals.get(currency) || { remaining: 0, paid: 0, overdue: 0 };
      total.remaining += remaining;
      total.paid += paid;
      if (status === "Overdue") total.overdue += remaining;
      totals.set(currency, total);
    }

    root.innerHTML = `<header class="workspace-section-head"><h2>Payments</h2>
      ${canInclude ? '<button type="button" class="primary-action" data-payment-add>+ Add payment item</button>' : ""}</header>
      <div class="workspace-grid workspace-subgrid">${Array.from(totals, ([currency, total]) => `<section class="workspace-card planner-register-summary">
        <h3>${escapeHtml(currency)}</h3><dl><div><dt>Outstanding</dt><dd>${escapeHtml(formatMoney(total.remaining, currency))}</dd></div>
        <div><dt>Overdue</dt><dd>${escapeHtml(formatMoney(total.overdue, currency))}</dd></div>
        <div><dt>Paid</dt><dd>${escapeHtml(formatMoney(total.paid, currency))}</dd></div></dl></section>`).join("")}</div>
      <section class="workspace-card">
        <header><h3>Payment schedule</h3><label class="form-label">Show<select data-payment-filter>
          <option value="open">Outstanding</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="all">All items</option>
        </select></label></header>
        <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Budget item</th><th>Due date</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody data-payment-rows></tbody></table></div>
      </section>`;

    const picker = root.querySelector("[data-payment-filter]");
    const body = root.querySelector("[data-payment-rows]");
    function renderRows() {
      const visible = payments.filter(item => picker.value === "all" ||
        (picker.value === "open" && item.remaining > 0) || (picker.value === "overdue" && item.status === "Overdue") ||
        (picker.value === "paid" && item.status === "Paid"));
      body.innerHTML = visible.map(({ row, remaining, paid, status }) => `<tr><th scope="row"><button type="button" class="planner-register-link" data-edit-payment="${escapeHtml(row.id)}">${escapeHtml(row.title)}</button>
        <small>${escapeHtml(labelCelebration(row.celebration))}</small></th><td>${formatDate(row.due_date)}</td>
        <td class="money">${escapeHtml(formatMoney(paid, row.currency))}</td><td class="money">${escapeHtml(formatMoney(remaining, row.currency))}</td>
        <td><span class="status-badge status-${status === "Overdue" ? "outstanding" : remaining === 0 ? "approved" : "pending"}">${status}</span></td></tr>`).join("") || tableEmpty(5, "No payment items match this filter.");
    }

    picker.addEventListener("change", renderRows);
    root.querySelector("[data-payment-add]")?.addEventListener("click", () => openEntity("budget_items", null, {
      celebration: ["spain", "south_africa"].includes(scope) ? scope : "shared",
      currency: scope === "south_africa" ? "ZAR" : "EUR"
    }));
    body.addEventListener("click", event => {
      const key = event.target.closest("[data-edit-payment]")?.dataset.editPayment;
      const row = rows.find(item => item.id === key);
      if (row) openEntity("budget_items", row);
    });
    renderRows();
  }

  function requestMeals(token) {
    mealError = "";
    const request = (async () => {
      try {
        const result = await plannerRpc("planner_load_guest_meals", { p_token: token });
        if (token === mealSession) meals = new Map((result || []).map(row => [row.guest_id, row]));
      } catch (error) {
        if (token === mealSession) mealError = error.message || "Could not load meal choices.";
      }
    })();
    mealRequest = request;
    request.finally(() => { if (mealRequest === request) mealRequest = null; });
    return request;
  }

  function renderMeals(root, { scope, token }) {
    if (token !== mealSession) {
      reset();
      mealSession = token;
    }
    root.innerHTML = `<header class="workspace-section-head"><h2>Catering</h2><button class="secondary-action" type="button" data-meals-refresh>Refresh choices</button></header>
      <section class="workspace-card" data-meals-list aria-label="Meal choices and dietary requirements"><p role="status">Loading meal choices&hellip;</p></section>`;
    const content = root.querySelector("[data-meals-list]");
    const refresh = root.querySelector("[data-meals-refresh]");
    const guests = state.data.guests.filter(row => inProject(row, scope)).sort((first, second) => first.name.localeCompare(second.name));

    function paint() {
      if (!content.isConnected || mealSession !== token) return;
      refresh.disabled = false;
      if (mealError || !meals) {
        content.innerHTML = `<p class="workspace-error" role="alert">${escapeHtml(mealError || "Could not load meal choices.")}</p>`;
        return;
      }
      content.innerHTML = `<h3>Meal choices</h3><div class="planner-register-filters">
        <label class="form-label">Find a guest<input type="search" data-meals-search></label>
        <label class="form-label">RSVP<select data-meals-filter><option value="planning">Attending or awaiting response</option>
          <option value="yes">Attending</option><option value="unassigned">Attending without a meal</option>
          <option value="all">All guests</option></select></label></div>
        <p data-meals-summary aria-live="polite"></p><p data-meals-status role="status"></p>
        <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Guest</th><th>RSVP</th><th>Dietary requirements</th><th>Meal choice</th></tr></thead>
        <tbody data-meals-rows></tbody></table></div>`;
      const filter = content.querySelector("[data-meals-filter]");
      const search = content.querySelector("[data-meals-search]");
      const summary = content.querySelector("[data-meals-summary]");
      const status = content.querySelector("[data-meals-status]");
      const body = content.querySelector("[data-meals-rows]");

      function updateSummary() {
        const attendees = guests.filter(row => row.rsvp_status === "yes");
        const selections = new Map();
        let missing = 0;
        for (const guest of attendees) {
          const meal = meals.get(guest.id)?.choice;
          if (!meal) { missing += 1; continue; }
          const key = meal.toLowerCase();
          const entry = selections.get(key) || { meal, count: 0 };
          entry.count += 1;
          selections.set(key, entry);
        }
        summary.textContent = [`${attendees.length} attending`, `${missing} still need a meal`, ...Array.from(selections.values(), entry => `${entry.meal} ${entry.count}`)].join(" \u00b7 ");
      }

      function renderRows() {
        const visible = guests.filter(row => filter.value === "all" ||
          (filter.value === "planning" && row.rsvp_status !== "no") ||
          (row.rsvp_status === "yes" && (filter.value === "yes" || !meals.get(row.id)?.choice)));
        body.innerHTML = searchRows(visible.map(row => ({ ...row, mealChoice: meals.get(row.id)?.choice })), search.value, ["name", "dietary", "mealChoice"])
          .map(row => `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${escapeHtml(labelRsvp(row.rsvp_status))}</td>
            <td>${escapeHtml(row.dietary || "\u2014")}</td><td><form class="planner-meal-form" data-meal-guest="${escapeHtml(row.id)}">
            <input name="meal" maxlength="120" aria-label="Meal choice for ${escapeHtml(row.name)}" value="${escapeHtml(row.mealChoice || "")}">
            <button class="secondary-action" type="submit" aria-label="Save meal for ${escapeHtml(row.name)}" disabled>Save</button></form></td></tr>`).join("") ||
          tableEmpty(4, "No guests match this filter.");
      }

      search.addEventListener("input", renderRows);
      filter.addEventListener("change", renderRows);
      body.addEventListener("input", event => {
        const form = event.target.closest("[data-meal-guest]");
        if (form) form.querySelector("button").disabled = form.elements.meal.value.trim() === (meals.get(form.dataset.mealGuest)?.choice || "");
      });
      body.addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.target.closest("[data-meal-guest]");
        const input = form.elements.meal;
        const button = form.querySelector("button");
        if (button.disabled) return;
        const guestId = form.dataset.mealGuest;
        const previous = meals.get(guestId);
        button.disabled = true;
        input.readOnly = true;
        refresh.disabled = true;
        try {
          const row = await plannerRpc("planner_set_guest_meal", {
            p_token: token, p_guest_id: guestId, p_choice: input.value.trim(), p_expected_version: previous?.version || 0
          });
          if (token !== mealSession) return;
          meals.set(guestId, row);
          input.value = row.choice || "";
          status.textContent = "Meal choice saved.";
          updateSummary();
          if (filter.value === "unassigned" && row.choice) renderRows();
        } catch (error) {
          status.textContent = error.message || "Could not save this meal choice.";
          button.disabled = false;
        } finally {
          input.readOnly = false;
          refresh.disabled = false;
        }
      });
      updateSummary();
      renderRows();
    }

    refresh.addEventListener("click", () => {
      refresh.disabled = true;
      (mealRequest || requestMeals(token)).then(paint);
    });
    if (meals || mealError) paint();
    else (mealRequest || requestMeals(token)).then(paint);
  }

  return { renderMeals, renderPayments, reset };
})();
