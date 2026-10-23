/* Gigify — public website behaviour (vanilla JS, no build step).
   Demo auth lives in localStorage; the full application in src/ handles real
   accounts, bookings and escrow. */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const USER_KEY = "gigify_demo_user";

  /* ---------------------------------------------------------------- utils */

  const money = (cents) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;"
      : c === "<" ? "&lt;"
      : c === ">" ? "&gt;"
      : c === '"' ? "&quot;"
      : "&#39;",
    );

  const initials = (name) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const unique = (values) => Array.from(new Set(values)).sort();

  const starString = (rating) =>
    "★".repeat(Math.round(rating)) + "☆".repeat(Math.max(0, 5 - Math.round(rating)));

  /* ---------------------------------------------------------- footer year */

  $$("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* ----------------------------------------------------------- mobile nav */

  const navToggle = $(".nav-toggle");
  const siteNav = $("#site-nav");
  if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
      const open = siteNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* --------------------------------------------------------------- toast */

  let toastEl = null;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastEl._hide);
    toastEl._hide = setTimeout(() => toastEl.classList.remove("show"), 3600);
  }

  /* -------------------------------------------------- demo auth (browser) */

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    syncAuth();
  }

  function syncAuth() {
    const user = getUser();
    $$(".guest-only").forEach((el) => el.classList.toggle("hidden", Boolean(user)));
    $$(".user-only").forEach((el) => el.classList.toggle("hidden", !user));
    if (user) {
      $$("[data-user-name]").forEach((el) => {
        el.textContent = user.name;
      });
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-signout]")) {
      localStorage.removeItem(USER_KEY);
      syncAuth();
      toast("You've been signed out.");
    }
  });

  syncAuth();

  /* ------------------------------------------------------ CTA gatekeepers */

  function requireAccount(message) {
    if (getUser()) return true;
    toast(message || "Create your free account first — it takes about 10 seconds.");
    setTimeout(() => {
      window.location.href = "register.html";
    }, 1200);
    return false;
  }

  document.addEventListener("click", (event) => {
    const apply = event.target.closest("[data-apply]");
    if (apply) {
      if (requireAccount("Sign up to apply — then the organizer sees you instantly.")) {
        toast("Application sent (demo)! In the full app you're notified by email when it's reviewed.");
      }
    }
    const contact = event.target.closest("[data-contact]");
    if (contact) {
      const name = contact.getAttribute("data-contact") || "this musician";
      if (requireAccount()) {
        toast(`Message sent to ${name} (demo). Full app: replies arrive by email + in-app.`);
      }
    }
  });

  /* --------------------------------------------------------------- modal */

  function wireModal() {
    const backdrop = $("#modal");
    if (!backdrop) return null;
    const body = $("#modal-body");
    const closeBtn = $(".modal-close", backdrop);
    const close = () => backdrop.classList.remove("open");
    if (closeBtn) closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    return {
      open(html) {
        body.innerHTML = html;
        backdrop.classList.add("open");
      },
    };
  }

  const modal = wireModal();

  /* ------------------------------------------------------------ filters */

  function fillSelect(select, values, labelFn) {
    if (!select) return;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelFn ? labelFn(value) : value;
      select.appendChild(option);
    });
  }

  /* ----------------------------------------------------------- gigs page */

  const gigsGrid = $("#gigs-grid");
  if (gigsGrid && typeof GIGS !== "undefined") {
    const form = $("#gig-filters");
    const qInput = $("#f-q");
    const typeSel = $("#f-type");
    const genreSel = $("#f-genre");
    const budgetSel = $("#f-budget");
    const countEl = $("#gigs-count");

    fillSelect(typeSel, unique(GIGS.map((g) => g.gigType)), (v) => GIG_TYPES[v] || v);
    fillSelect(genreSel, unique(GIGS.flatMap((g) => g.genres)));

    function matching() {
      const q = (qInput.value || "").trim().toLowerCase();
      const cap = budgetSel.value ? Number(budgetSel.value) : null;
      return GIGS.filter((g) => {
        if (
          q &&
          !`${g.title} ${g.org} ${g.location} ${g.venue} ${g.genres.join(" ")}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (typeSel.value && g.gigType !== typeSel.value) return false;
        if (genreSel.value && !g.genres.includes(genreSel.value)) return false;
        if (cap !== null && g.budgetCents > cap) return false;
        return true;
      });
    }

    function gigCard(g) {
      const badges = [
        `<span class="badge badge-brand">${escapeHtml(GIG_TYPES[g.gigType] || g.gigType)}</span>`,
        ...g.genres.slice(0, 2).map((x) => `<span class="badge">${escapeHtml(x)}</span>`),
      ].join("");
      return `
        <article class="card">
          <div>
            <div class="tags">${badges}</div>
            <h3>${escapeHtml(g.title)}</h3>
          </div>
          <div class="meta">
            <span>${escapeHtml(g.location)}</span>
            <span>${fmtDate(g.eventDate)}</span>
            <span>${g.durationHours} hrs</span>
          </div>
          <p class="desc">${escapeHtml(g.description)}</p>
          <div class="card-foot">
            <span class="budget">${money(g.budgetCents)} <small>budget</small></span>
            <button type="button" class="btn btn-outline" data-gig="${g.id}">View details</button>
          </div>
        </article>`;
    }

    function render() {
      const items = matching();
      countEl.textContent =
        items.length === GIGS.length
          ? `${items.length} open gigs`
          : `${items.length} of ${GIGS.length} gigs match your filters`;
      gigsGrid.innerHTML = items.length
        ? items.map(gigCard).join("")
        : `<div class="empty">No gigs match those filters — try widening the budget or clearing the search.</div>`;
    }

    if (form) {
      form.addEventListener("submit", (e) => e.preventDefault());
      form.addEventListener("input", render);
      form.addEventListener("change", render);
      form.addEventListener("reset", () => setTimeout(render, 0));
    }

    gigsGrid.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-gig]");
      if (!btn || !modal) return;
      const g = GIGS.find((x) => x.id === btn.getAttribute("data-gig"));
      if (!g) return;
      modal.open(`
        <div class="tags"><span class="badge badge-brand">${escapeHtml(GIG_TYPES[g.gigType] || g.gigType)}</span></div>
        <h3>${escapeHtml(g.title)}</h3>
        <div class="meta">
          <span>${escapeHtml(g.org)}</span>
          <span>${escapeHtml(g.venue)}</span>
          <span>${fmtDate(g.eventDate)}</span>
        </div>
        <p>${escapeHtml(g.description)}</p>
        <ul class="detail-list">
          <li>Location <b>${escapeHtml(g.location)}</b></li>
          <li>Duration <b>${g.durationHours} hours</b></li>
          <li>Genres <b>${escapeHtml(g.genres.join(", "))}</b></li>
          <li>Budget <b>${money(g.budgetCents)}</b></li>
          ${g.requirements ? `<li>Requirements <b>${escapeHtml(g.requirements)}</b></li>` : ""}
        </ul>
        <p class="small muted">Payment is held in escrow until the gig is complete — the musician
        receives <b>${money(Math.round(g.budgetCents * 0.85))}</b> (85%) after Gigify's 15% fee.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" data-apply>Apply as a musician</button>
          <button type="button" class="btn btn-outline" data-signout style="display:none"></button>
          <a class="btn btn-ghost" href="register.html">Create account</a>
        </div>`);
    });

    render();
  }

  /* ------------------------------------------------------ musicians page */

  const musiciansGrid = $("#musicians-grid");
  if (musiciansGrid && typeof MUSICIANS !== "undefined") {
    const form = $("#musician-filters");
    const qInput = $("#m-q");
    const instSel = $("#m-instrument");
    const genreSel = $("#m-genre");
    const rateSel = $("#m-rate");
    const countEl = $("#musicians-count");

    fillSelect(instSel, unique(MUSICIANS.flatMap((m) => m.instruments)));
    fillSelect(genreSel, unique(MUSICIANS.flatMap((m) => m.genres)));

    function matching() {
      const q = (qInput.value || "").trim().toLowerCase();
      const cap = rateSel.value ? Number(rateSel.value) : null;
      return MUSICIANS.filter((m) => {
        if (
          q &&
          !`${m.name} ${m.headline} ${m.location} ${m.instruments.join(" ")} ${m.genres.join(" ")}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (instSel.value && !m.instruments.includes(instSel.value)) return false;
        if (genreSel.value && !m.genres.includes(genreSel.value)) return false;
        if (cap !== null && m.dayRateCents > cap) return false;
        return true;
      });
    }

    function musicianCard(m) {
      const tags = m.instruments
        .slice(0, 3)
        .map((x) => `<span class="badge">${escapeHtml(x)}</span>`)
        .join("");
      const availability = m.available
        ? `<span class="badge badge-green">Available</span>`
        : `<span class="badge badge-amber">Booked for now</span>`;
      return `
        <article class="card">
          <div class="card-head">
            <div class="avatar" aria-hidden="true">${escapeHtml(initials(m.name))}</div>
            <div>
              <h3>${escapeHtml(m.name)}</h3>
              <div class="muted small">${escapeHtml(m.headline)} · ${escapeHtml(m.location)}</div>
              <div class="stars" aria-label="${m.rating} out of 5 stars">
                ${starString(m.rating)}<span>${m.rating.toFixed(1)} (${m.reviewCount} reviews)</span>
              </div>
            </div>
          </div>
          <div class="tags">${tags}</div>
          <div class="card-foot">
            <span class="budget">${money(m.dayRateCents)} <small>/ day</small></span>
            <span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end">
              ${availability}
              <button type="button" class="btn btn-outline" data-musician="${m.id}">View profile</button>
            </span>
          </div>
        </article>`;
    }

    function render() {
      const items = matching();
      countEl.textContent =
        items.length === MUSICIANS.length
          ? `${items.length} musicians in the directory`
          : `${items.length} of ${MUSICIANS.length} musicians match your filters`;
      musiciansGrid.innerHTML = items.length
        ? items.map(musicianCard).join("")
        : `<div class="empty">No musicians match those filters — try another instrument or a higher rate cap.</div>`;
    }

    if (form) {
      form.addEventListener("submit", (e) => e.preventDefault());
      form.addEventListener("input", render);
      form.addEventListener("change", render);
      form.addEventListener("reset", () => setTimeout(render, 0));
    }

    musiciansGrid.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-musician]");
      if (!btn || !modal) return;
      const m = MUSICIANS.find((x) => x.id === btn.getAttribute("data-musician"));
      if (!m) return;
      modal.open(`
        <div class="card-head">
          <div class="avatar" aria-hidden="true">${escapeHtml(initials(m.name))}</div>
          <div>
            <h3 style="margin-top:.3rem">${escapeHtml(m.name)}</h3>
            <div class="muted small">${escapeHtml(m.headline)} · ${escapeHtml(m.location)}</div>
            <div class="stars" aria-label="${m.rating} out of 5 stars">
              ${starString(m.rating)}<span>${m.rating.toFixed(1)} (${m.reviewCount} reviews)</span>
            </div>
          </div>
        </div>
        <p>${escapeHtml(m.bio)}</p>
        <ul class="detail-list">
          <li>Instruments <b>${escapeHtml(m.instruments.join(", "))}</b></li>
          <li>Genres <b>${escapeHtml(m.genres.join(", "))}</b></li>
          <li>Experience <b>${m.experienceYears} years</b></li>
          <li>Day rate <b>${money(m.dayRateCents)}</b></li>
          <li>Status <b>${m.available ? "Available for bookings" : "Booked for now"}</b></li>
        </ul>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" data-contact="${escapeHtml(m.name)}">Contact ${escapeHtml(m.name.split(" ")[0])}</button>
          <a class="btn btn-ghost" href="gigs.html">See open gigs</a>
        </div>`);
    });

    render();
  }

  /* -------------------------------------------------------- auth (demo) */

  function showFormError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
  }

  const prettyName = (email) =>
    email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const loginForm = $("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const errorEl = $("#form-error");
      const email = $("#email").value.trim().toLowerCase();
      const password = $("#password").value;
      const role = $("#role").value;
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        showFormError(errorEl, "Enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        showFormError(errorEl, "Password must be at least 6 characters.");
        return;
      }
      const name = prettyName(email);
      setUser({ name, email, role });
      toast(`Welcome back, ${name}!`);
      setTimeout(() => {
        window.location.href = "gigs.html";
      }, 700);
    });
  }

  const registerForm = $("#register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const errorEl = $("#form-error");
      const name = $("#name").value.trim();
      const email = $("#email").value.trim().toLowerCase();
      const password = $("#password").value;
      const roleInput = registerForm.querySelector('input[name="role"]:checked');
      if (name.length < 2) {
        showFormError(errorEl, "Please enter your name.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        showFormError(errorEl, "Enter a valid email address.");
        return;
      }
      if (password.length < 8) {
        showFormError(errorEl, "Password must be at least 8 characters.");
        return;
      }
      if (!roleInput) {
        showFormError(errorEl, "Choose how you'll use Gigify.");
        return;
      }
      setUser({ name, email, role: roleInput.value });
      toast(`Welcome to Gigify, ${name}!`);
      setTimeout(() => {
        window.location.href = "gigs.html";
      }, 700);
    });
  }
})();
