/** Project finder: types real tasks into the search, filters the cards by text and shelf, keeps both in the URL. */
(() => {
  const input = document.getElementById("q");
  const cards = [...document.querySelectorAll(".card")];
  const chips = [...document.querySelectorAll(".chip")];
  const status = document.querySelector(".status");
  const empty = document.querySelector(".empty");
  if (!input || !cards.length) return;

  const tasks = JSON.parse(input.dataset.tasks || "[]");
  const deckCards = new Map([...document.querySelectorAll(".deck a")].map((a) => [a.dataset.name, a]));
  const defaultOrder = cards.map((c) => c.querySelector(".name").textContent);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let shelf = "";
  let task = null;

  const fold = (s) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/ı/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  /** Each query word has to start a word of the project text, so "udf" finds UDF tools but not "cloudflare". */
  const wordsOf = new Map(cards.map((c) => [c, c.dataset.search.split(/[^a-z0-9.+#]+/).filter(Boolean)]));
  /** Short words only match short words, so "mac" finds macOS apps without pulling in "machine". */
  const fits = (t, w) => t.startsWith(w) && (w.length > 3 || t.length <= w.length + 2);
  const hits = (card, words) => words.every((w) => wordsOf.get(card).some((t) => fits(t, w)));

  /** Matches go to the front of the deck, best first; the most starred projects fill the places behind them. */
  function arrange(names) {
    const lead = names.filter((n) => deckCards.has(n));
    const list = [...lead, ...defaultOrder.filter((n) => deckCards.has(n) && !lead.includes(n))].slice(0, 5);
    for (const [name, el] of deckCards) {
      const k = list.indexOf(name);
      el.style.setProperty("--k", k < 0 ? 6 : k);
      el.classList.toggle("out", k < 0);
      el.classList.toggle("front", k === 0);
    }
  }

  function matches(query, onShelf) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return cards
      .filter((c) => (!onShelf || c.dataset.shelves.split(" ").includes(onShelf)) && hits(c, words))
      .map((c) => c.querySelector(".name").textContent);
  }

  function apply() {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const inShelf = !shelf || card.dataset.shelves.split(" ").includes(shelf);
      const hit = inShelf && hits(card, words);
      card.hidden = !hit;
      if (hit) shown++;
    }
    empty.hidden = shown > 0;
    arrange(words.length || shelf ? matches(input.value, shelf) : defaultOrder);
    status.textContent = words.length || shelf ? `${shown} of ${cards.length} projects` : "";
    const params = new URLSearchParams();
    if (input.value.trim()) params.set("q", input.value.trim());
    if (shelf) params.set("shelf", shelf);
    history.replaceState(null, "", params.size ? `?${params}` : location.pathname);
  }

  /** The cards slide to their new places when the browser can animate the change. */
  function update() {
    if (!still && document.startViewTransition) document.startViewTransition(apply);
    else apply();
  }

  function setShelf(id) {
    shelf = id;
    for (const chip of chips) chip.setAttribute("aria-pressed", String(chip.dataset.shelf === id));
  }

  chips.forEach((chip) => chip.addEventListener("click", () => {
    setShelf(chip.dataset.shelf);
    update();
  }));
  input.addEventListener("input", update);
  input.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim() && task) {
      input.value = task.q;
      stopTyping();
      update();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      update();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      input.focus();
    }
  });

  /** Placeholder typing: one task at a time, paused while the visitor types or after they filter. */
  let timer = 0;
  function stopTyping() {
    clearTimeout(timer);
    timer = 0;
    input.placeholder = "type a task or a tool name";
    input.closest(".prompt").classList.remove("typing");
  }
  function typeTasks() {
    if (still || !tasks.length) {
      task = tasks[0] || null;
      if (task) input.placeholder = task.text;
      return;
    }
    let t = 0;
    let n = 0;
    let deleting = false;
    input.closest(".prompt").classList.add("typing");
    const step = () => {
      task = tasks[t];
      const text = task.text;
      n += deleting ? -1 : 1;
      input.placeholder = text.slice(0, n);
      let wait = deleting ? 22 : 48;
      if (!deleting && n === text.length) {
        deleting = true;
        wait = 2600;
        arrange(matches(task.q, ""));
      } else if (deleting && n === 0) {
        deleting = false;
        t = (t + 1) % tasks.length;
        wait = 350;
      }
      timer = setTimeout(step, wait);
    };
    step();
  }

  input.addEventListener("focus", () => {
    if (timer) stopTyping();
  });

  const params = new URLSearchParams(location.search);
  if (params.get("shelf")) setShelf(params.get("shelf"));
  if (params.get("q")) input.value = params.get("q");
  arrange(defaultOrder);
  if (params.size) apply();
  else typeTasks();
})();
