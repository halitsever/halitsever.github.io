/** Project finder: types real tasks into the search, filters the cards by text and shelf, keeps both in the URL. */
(() => {
  const input = document.getElementById("q");
  const cards = [...document.querySelectorAll(".card")];
  const chips = [...document.querySelectorAll(".chip")];
  const status = document.querySelector(".status");
  const empty = document.querySelector(".empty");
  if (!input || !cards.length) return;

  const tasks = JSON.parse(input.dataset.tasks || "[]");
  const idle = input.placeholder;
  const list = document.getElementById("cards");
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
    if (timer) stopTyping();
    setShelf(chip.dataset.shelf);
    update();
  }));
  input.addEventListener("input", update);
  /** Search fills in the task on screen when the field is empty, then brings the matches into view. */
  input.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim() && task) {
      input.value = task.q;
      stopTyping();
      update();
    }
    list.scrollIntoView({ behavior: still ? "auto" : "smooth" });
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
    input.placeholder = idle;
    input.form.classList.remove("typing");
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
    input.form.classList.add("typing");
    const step = () => {
      task = tasks[t];
      const text = task.text;
      n += deleting ? -1 : 1;
      input.placeholder = text.slice(0, n);
      let wait = deleting ? 22 : 48;
      if (!deleting && n === text.length) {
        deleting = true;
        wait = 2600;
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
  if (params.size) apply();
  else typeTasks();
})();

/** Hero screen: a cursor tours nine products and the camera zooms where it clicks, until the visitor takes over. */
(() => {
  const cam = document.querySelector(".cam");
  if (!cam) return;
  const sheet = cam.querySelector(".cam-sheet");
  const tiles = [...cam.querySelectorAll(".cam-tile")];
  const shows = [...cam.querySelectorAll(".cam-now [data-i]")];
  const now = cam.querySelector(".cam-now");
  const cursor = cam.querySelector(".cam-cursor");
  const ring = cam.querySelector(".cam-ring");
  const play = cam.querySelector(".cam-play");
  const label = play.querySelector("span");
  const videos = [...cam.querySelectorAll("video")];
  const tour = cam.dataset.tour.split(",").map(Number);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let zoomed = -1;
  let step = 0;
  let run = 0;
  let touring = false;
  let wanted = !still;
  let inView = true;

  function caption(i) {
    for (const s of shows) s.hidden = Number(s.dataset.i) !== i;
  }

  function zoom(i) {
    zoomed = i;
    cam.classList.toggle("is-zoomed", i >= 0);
    if (i < 0) return;
    sheet.style.setProperty("--c", i % 3);
    sheet.style.setProperty("--r", Math.floor(i / 3));
    caption(i);
  }

  function aim(el, i) {
    el.style.left = `${(((i % 3) + 0.5) / 3) * 100}%`;
    el.style.top = `${((Math.floor(i / 3) + 0.5) / 3) * 100}%`;
  }

  /** Each tour gets an id, so a wait from a stopped tour never resumes it. */
  const wait = (ms, id) => new Promise((ok, stop) => setTimeout(() => (id === run ? ok() : stop()), ms));

  async function start() {
    if (touring || !wanted || !inView || document.hidden) return;
    touring = true;
    const id = ++run;
    now.removeAttribute("aria-live");
    cursor.classList.add("on");
    try {
      if (zoomed >= 0) {
        zoom(-1);
        await wait(1300, id);
      }
      // the full screen holds for a moment first, so the visitor sees all nine before the camera moves
      if (step === 0) await wait(1400, id);
      for (;;) {
        const i = tour[step++ % tour.length];
        aim(cursor, i);
        await wait(1100, id);
        cursor.classList.add("down");
        aim(ring, i);
        ring.classList.remove("go");
        void ring.offsetWidth;
        ring.classList.add("go");
        await wait(180, id);
        cursor.classList.remove("down");
        zoom(i);
        cursor.style.left = "58%";
        cursor.style.top = "64%";
        await wait(4800, id);
        zoom(-1);
        await wait(1500, id);
      }
    } catch {
      /* a newer tour or a stop took over */
    }
  }

  function halt() {
    run++;
    touring = false;
    cursor.classList.remove("on", "down");
  }

  function setWanted(on) {
    wanted = on;
    play.classList.toggle("paused", !on);
    label.textContent = on ? "Pause tour" : "Play tour";
    if (on) start();
    else halt();
  }

  tiles.forEach((tile, i) => {
    tile.addEventListener("click", (e) => {
      e.preventDefault();
      setWanted(false);
      now.setAttribute("aria-live", "polite");
      zoom(zoomed === i ? -1 : i);
    });
  });

  cam.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && zoomed >= 0) zoom(-1);
  });

  play.hidden = false;
  play.addEventListener("click", () => setWanted(!wanted));
  if (still) setWanted(false);

  /** Videos and the tour only run while the screen is on screen, so a scrolled-away hero costs nothing. */
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    for (const v of videos) {
      if (inView && !still) v.play().catch(() => {});
      else v.pause();
    }
    if (inView) start();
    else halt();
  }).observe(cam.querySelector(".cam-screen"));

  document.addEventListener("visibilitychange", () => (document.hidden ? halt() : start()));
})();
