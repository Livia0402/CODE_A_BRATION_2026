/* =====================================================================
   THE PUPPY PROJECT - script.js

   ✏️  EVERYTHING YOU NEED TO EDIT OR ADD IS AT THE END OF THIS FILE,
       in the block called "EDIT HERE" (search for: EDIT HERE).
       The code above it just makes the site work.
   ===================================================================== */

/* ============================ HELPERS ============================== */
const IMG_BASES = [
  "/",
  "",
  "public/",
  "/public/",
  "images/",
  "/images/",
  "src/fotos/",
  "/src/fotos/",
];
const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
let lang =
  store.get("lang") ||
  (navigator.language && navigator.language.toLowerCase().startsWith("pt")
    ? "pt"
    : "en");

function t(key, vars = {}) {
  let s = (i18n[lang] && i18n[lang][key]) ?? i18n.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Finds an image no matter where it lives (root, public/, images/ ...) and tries "Pug.png" as well as "pug.png".
// If it still can't be found, the browser console (F12) tells you exactly which paths were tried.
const IMG_BASES = ["/", "", "public/", "/public/", "images/", "/images/"];
function setImg(el, file) {
  if (/^(https?:|data:|blob:)/.test(file)) {
    el.src = file;
    return;
  }
  const clean = file.replace(/^\/+/, "");
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
  const tries = [];
  IMG_BASES.forEach((b) => {
    tries.push(b + clean);
    if (cap !== clean) tries.push(b + cap);
  });
  let i = 0;
  el.classList.remove("img-missing");
  el.onerror = () => {
    i++;
    if (i < tries.length) {
      el.src = tries[i];
      return;
    }
    el.onerror = null;
    el.classList.add("img-missing");
    console.error("Image not found: " + clean + ". Tried:", tries);
  };
  el.src = tries[0];
}

// Maps a Teachable Machine class name to a key in breedData ("Pug" -> "Pugs", "yorkshire terrier" -> "Yorkshire")
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");
const breedLookup = {};
function buildBreedLookup() {
  for (const [key, d] of Object.entries(breedData)) {
    breedLookup[norm(key)] = key;
    breedLookup[norm(d.name)] = key;
  }
  for (const [alias, key] of Object.entries(extraAliases)) {
    if (breedData[key]) breedLookup[norm(alias)] = key;
  }
}
function getBreedKey(className) {
  return breedLookup[norm(className)] || null;
}

// Draws an image on a white square so transparent PNGs don't turn black for the AI
function toWhiteCanvas(img, size = 224) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(size / w, size / h);
  ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  return c;
}

/* ============================== THEME ============================== */
const themeBtn = $("#theme-toggle");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  store.set("theme", theme);
}
themeBtn.addEventListener("click", () => {
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark"
  );
});
applyTheme(
  store.get("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
);

/* ============================= LANGUAGE ============================ */
const langBtn = $("#lang-toggle");
let statusKey = "";

function renderStatus() {
  $("#status").textContent = statusKey ? t(statusKey) : "";
}
function setStatus(key) {
  statusKey = key;
  renderStatus();
}

function applyLang() {
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  langBtn.textContent = lang === "en" ? "🇧🇷 PT" : "🇺🇸 EN";
  store.set("lang", lang);

  // Re-render everything that is built by JavaScript
  renderStatus();
  renderCarousel();
  renderUpcoming();
  renderFact();
  if (lastPrediction) showResults(lastPrediction);
  if (currentBreed && $("#breed-modal").classList.contains("open"))
    fillBreedModal(currentBreed);
  if (!$("#sug-note").classList.contains("hidden"))
    $("#sug-note").textContent = t(sugNoteKey);
}
langBtn.addEventListener("click", () => {
  lang = lang === "en" ? "pt" : "en";
  applyLang();
});

/* ================== AI MODEL + WEBCAM + UPLOAD ===================== */
let model,
  webcam,
  webcamRunning = false,
  modelReady;

function loadModel() {
  modelReady = (async () => {
    try {
      setStatus("loadingModel");
      model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
      );
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("modelError");
    }
  })();
}

async function classify(source) {
  await modelReady;
  if (!model) return;
  const prediction = await model.predict(source);
  handlePrediction(prediction);
}

async function startWebcam() {
  await modelReady;
  if (!model) return;
  try {
    if (!webcam) {
      webcam = new tmImage.Webcam(250, 250, true); // width, height, flip
      await webcam.setup();
      $("#webcam-container").appendChild(webcam.canvas);
    }
    await webcam.play();
  } catch (err) {
    console.error(err);
    setStatus("camError");
    return;
  }
  setStatus("");
  $("#preview").classList.add("hidden");
  $("#webcam-container").classList.remove("hidden");
  if (!webcamRunning) {
    webcamRunning = true;
    window.requestAnimationFrame(webcamLoop);
  }
}

async function webcamLoop() {
  if (!webcamRunning) return;
  webcam.update();
  await classify(webcam.canvas);
  window.requestAnimationFrame(webcamLoop);
}

function pauseWebcam() {
  webcamRunning = false;
  if (webcam) webcam.pause();
  $("#webcam-container").classList.add("hidden");
}

$("#start-btn").addEventListener("click", startWebcam);

/* ---- Upload: click or drag & drop ---- */
const detector = $("#detector");
const dropzone = $("#dropzone");
const fileInput = $("#file-input");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  handleFile(fileInput.files[0]);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((ev) =>
  detector.addEventListener(ev, (e) => {
    e.preventDefault();
    detector.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((ev) =>
  detector.addEventListener(ev, (e) => {
    e.preventDefault();
    detector.classList.remove("drag-over");
  })
);
detector.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
// Stops the browser from opening a photo when it is dropped outside the card
["dragover", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => e.preventDefault())
);

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    if (file) setStatus("notImage");
    return;
  }
  setStatus("");
  pauseWebcam();
  const preview = $("#preview");
  const url = URL.createObjectURL(file);
  preview.onload = () => {
    classify(toWhiteCanvas(preview));
    URL.revokeObjectURL(url);
  };
  preview.src = url;
  preview.classList.remove("hidden");
}

/* =========================== TOP-3 RESULTS ========================= */
const rows = [];
let lastPrediction = null;

(function buildRows() {
  for (let i = 0; i < 3; i++) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "bar-row";
    row.innerHTML = `<span class="bar-label"></span><span class="bar-track"><span class="bar-fill"></span></span><span class="bar-percent"></span>`;
    $("#result-rows").appendChild(row);
    rows.push({
      row,
      label: row.querySelector(".bar-label"),
      fill: row.querySelector(".bar-fill"),
      pct: row.querySelector(".bar-percent"),
    });
  }
})();

$("#result-rows").addEventListener("click", (e) => {
  const row = e.target.closest(".bar-row");
  if (row && row.dataset.breed) showBreed(row.dataset.breed);
});

function showResults(prediction) {
  lastPrediction = prediction;
  const top = [...prediction]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
  $("#results").classList.remove("hidden");

  top.forEach((p, i) => {
    const key = getBreedKey(p.className);
    const r = rows[i];
    const pct = Math.round(p.probability * 100);
    r.label.textContent = key ? breedData[key].name : p.className;
    r.fill.style.width = pct + "%";
    r.pct.textContent = pct + "%";
    r.row.dataset.breed = key || "";
    r.row.classList.toggle("clickable", !!key);
    r.row.classList.toggle("best", i === 0);
  });

  $("#unsure").classList.toggle("hidden", top[0].probability >= 0.5);

  const learn = $("#learn-btn");
  const bestKey = getBreedKey(top[0].className);
  if (top[0].probability >= 0.6 && bestKey) {
    learn.textContent = t("learnMore", { breed: breedData[bestKey].name });
    learn.onclick = () => showBreed(bestKey);
    learn.classList.remove("hidden");
  } else {
    learn.classList.add("hidden");
  }
}

let celebrating = false;
function handlePrediction(prediction) {
  showResults(prediction);
  const best = Math.max(...prediction.map((p) => p.probability));
  if (best > 0.9 && !celebrating) {
    celebrating = true;
    pawConfetti();
    setTimeout(() => (celebrating = false), 5000);
  }
}

function pawConfetti() {
  for (let i = 0; i < 25; i++) {
    const paw = document.createElement("span");
    paw.textContent = "🐾";
    paw.className = "paw";
    paw.style.left = Math.random() * 100 + "vw";
    paw.style.animationDuration = 2 + Math.random() * 2 + "s";
    paw.style.fontSize = 18 + Math.random() * 20 + "px";
    document.body.appendChild(paw);
    setTimeout(() => paw.remove(), 4200);
  }
}

/* ============================== MODALS ============================= */
function openModal(id) {
  $("#" + id).classList.add("open");
}
function closeModal(modal) {
  modal.classList.remove("open");
}

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.classList.contains("modal-close"))
      closeModal(modal);
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document.querySelectorAll(".modal.open").forEach(closeModal);
});
$("#creator-btn").addEventListener("click", () => openModal("creator-modal"));

function setupCreator() {
  $("#creator-name").textContent = CREATOR.name;
  setImg($(".avatar"), CREATOR.photo);
  const box = $("#socials");
  box.innerHTML = "";
  CREATOR.socials.forEach((s) => {
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = s.label;
    box.appendChild(a);
  });
}

let currentBreed = null;
function fillBreedModal(key) {
  const d = breedData[key];
  setImg($("#breed-img"), d.img);
  $("#breed-img").alt = d.name;
  $("#breed-name").textContent = d.name;
  $("#breed-desc").textContent = d.desc[lang];
  $("#breed-facts").innerHTML = d.facts[lang]
    .map((f) => `<li>${f}</li>`)
    .join("");
}
function showBreed(key) {
  currentBreed = key;
  fillBreedModal(key);
  openModal("breed-modal");
}

/* ============================== CAROUSEL =========================== */
function renderCarousel() {
  const carousel = $("#carousel");
  carousel.innerHTML = "";
  Object.entries(breedData).forEach(([key, d]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "carousel-item";
    const img = document.createElement("img");
    img.alt = d.name;
    setImg(img, d.img);
    const label = document.createElement("span");
    label.textContent = d.name;
    item.append(img, label);
    item.addEventListener("click", () => showBreed(key));
    carousel.appendChild(item);
  });
}
$("#prev").addEventListener("click", () =>
  $("#carousel").scrollBy({ left: -220, behavior: "smooth" })
);
$("#next").addEventListener("click", () =>
  $("#carousel").scrollBy({ left: 220, behavior: "smooth" })
);

/* ============================= DOG FACTS =========================== */
let factIndex = -1;
function renderFact() {
  if (factIndex < 0) return;
  const bubble = $("#fact-bubble");
  bubble.textContent = "🐶 " + dogFacts[factIndex][lang];
  bubble.classList.remove("hidden", "pop");
  void bubble.offsetWidth; // restarts the pop animation
  bubble.classList.add("pop");
}
$("#fact-btn").addEventListener("click", () => {
  let i;
  do {
    i = Math.floor(Math.random() * dogFacts.length);
  } while (i === factIndex && dogFacts.length > 1);
  factIndex = i;
  renderFact();
});

/* ========================= UPCOMING FEATURES ======================= */
let votes = [];
try {
  votes = JSON.parse(store.get("votes") || "[]");
} catch {
  votes = [];
}

function renderUpcoming() {
  const list = $("#upcoming-list");
  list.innerHTML = "";
  upcoming.forEach((f) => {
    const voted = votes.includes(f.id);
    const item = document.createElement("div");
    item.className = "feature";
    item.innerHTML = `
      <div class="feature-info">
        <strong>${f.title[lang]}</strong>
        <span>${f.desc[lang]}</span>
      </div>
      <button type="button" class="vote-btn ${voted ? "voted" : ""}">${t(
      voted ? "voted" : "vote"
    )}</button>`;
    item.querySelector(".vote-btn").addEventListener("click", () => {
      votes = votes.includes(f.id)
        ? votes.filter((v) => v !== f.id)
        : [...votes, f.id];
      store.set("votes", JSON.stringify(votes));
      renderUpcoming();
    });
    list.appendChild(item);
  });
}

/* ============================= SUGGESTIONS ========================= */
let sugNoteKey = "sugThanks";
function showSugNote(key) {
  sugNoteKey = key;
  const note = $("#sug-note");
  note.textContent = t(key);
  note.classList.remove("hidden");
}

$("#suggest-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: $("#sug-name").value.trim(),
    type: $("#sug-type").value,
    message: $("#sug-msg").value.trim(),
  };
  if (!data.message) return;

  if (FORM_ENDPOINT) {
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("bad response");
      showSugNote("sugThanks");
      e.target.reset();
    } catch (err) {
      console.error(err);
      showSugNote("sugError");
    }
  } else {
    // No backend: open the visitor's mail app with everything pre-filled
    const subject = encodeURIComponent(`[Puppy Project] ${data.type}`);
    const body = encodeURIComponent(
      `${data.message}\n\n- ${data.name || "Anonymous"}`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    showSugNote("sugThanks");
    e.target.reset();
  }
});

/* #####################################################################
   #####################################################################
   ##                                                                 ##
   ##                  ✏️   EDIT HERE   ✏️                             ##
   ##        Everything below is what YOU change or add to.           ##
   ##                                                                 ##
   ##   1. Your links and AI model ........ MODEL_URL, email, form    ##
   ##   2. About you (popup) .............. CREATOR                   ##
   ##   3. ADD A NEW BREED ................ breedData                 ##
   ##   4. Dog facts ...................... dogFacts                  ##
   ##   5. Upcoming features card ......... upcoming                  ##
   ##   6. All the site texts (EN / PT) ... i18n                      ##
   ##                                                                 ##
   #####################################################################
   ##################################################################### */

/* ---------------------------------------------------------------------
   1. LINKS AND AI MODEL
   --------------------------------------------------------------------- */
// Your Teachable Machine link. Keep the "/" at the end!
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/oo0maGp2k/";
// Suggestions form: with no FORM_ENDPOINT it opens the visitor's email app, sending to this address.
const CONTACT_EMAIL = "Livia.alvasconcellos@email.com";
// Optional: paste a Formspree URL here to receive suggestions without opening the email app.
const FORM_ENDPOINT = "";

/* ---------------------------------------------------------------------
   2. ABOUT YOU (the "Meet the creator" popup)
   photo: put the file in /public with this exact name.
   The short bio text is in section 6 (i18n -> creatorBio).
   Add or remove social links by adding/removing a line.
   --------------------------------------------------------------------- */
const CREATOR = {
  name: "Livia",
  photo: "livia.jpg",
  socials: [
    { label: "GitHub", url: "https://github.com/Livia0402" },
    { label: "LinkedIn", url: "https://linkedin.com/in/YOUR_USER" },
    {
      label: "Instagram",
      url: "https://www.instagram.com/privs._livii?exln=MzRheGdlYnEwajNh&utm_source=qr",
    },
  ],
};

/* ---------------------------------------------------------------------
   3. BREEDS  (👉 TO ADD A NEW BREED: copy one block, paste it below the last
   one, and change the info. Then put the cutout PNG in /public.)

   - The KEY (the name before the colon) must match the class name in
     Teachable Machine. Capital letters, spaces and a final "s" don't matter.
   - name: how it appears on the site.
   - img:  file name of the cutout (in /public).
   - desc / facts: write them in English (en) and Portuguese (pt).
   - Don't forget the comma after the closing "}" of each breed!
   --------------------------------------------------------------------- */
const breedData = {
  Pugs: {
    name: "Pug",
    img: "pug.png",
    desc: {
      en: "Small, wrinkly and full of personality. Pugs are loyal companions that love attention.",
      pt: "Pequeno, enrugadinho e cheio de personalidade. Os pugs são companheiros leais que adoram atenção.",
    },
    facts: {
      en: [
        "Origin: China",
        "Size: Small (6–8 kg)",
        "Lifespan: 12–15 years",
        "Fun fact: Their motto is 'multum in parvo', which means 'a lot in a little'.",
      ],
      pt: [
        "Origem: China",
        "Tamanho: Pequeno (6–8 kg)",
        "Expectativa de vida: 12–15 anos",
        "Curiosidade: O lema da raça é 'multum in parvo', que significa 'muito em pouco'.",
      ],
    },
  },
  Yorkshire: {
    name: "Yorkshire",
    img: "yorkshire.png",
    desc: {
      en: "A tiny terrier with a huge attitude. Brave, energetic and very affectionate.",
      pt: "Um terrier minúsculo com uma personalidade gigante. Corajoso, cheio de energia e muito carinhoso.",
    },
    facts: {
      en: [
        "Origin: England",
        "Size: Tiny (2–3 kg)",
        "Lifespan: 13–16 years",
        "Fun fact: They were originally bred to catch rats in mills.",
      ],
      pt: [
        "Origem: Inglaterra",
        "Tamanho: Minúsculo (2–3 kg)",
        "Expectativa de vida: 13–16 anos",
        "Curiosidade: Foram criados originalmente para caçar ratos em fábricas.",
      ],
    },
  },
  Chihuahua: {
    name: "Chihuahua",
    img: "chihuahua.png",
    desc: {
      en: "The smallest dog breed in the world, famous for being bold and fiercely loyal.",
      pt: "A menor raça de cachorro do mundo, famosa por ser corajosa e super leal.",
    },
    facts: {
      en: [
        "Origin: Mexico",
        "Size: Tiny (1.5–3 kg)",
        "Lifespan: 14–16 years",
        "Fun fact: Puppies are born with a soft spot on their skull, like human babies.",
      ],
      pt: [
        "Origem: México",
        "Tamanho: Minúsculo (1,5–3 kg)",
        "Expectativa de vida: 14–16 anos",
        "Curiosidade: Os filhotes nascem com uma moleira no crânio, como os bebês humanos.",
      ],
    },
  },
  "Basset Hound": {
    name: "Basset Hound",
    img: "basset.png",
    desc: {
      en: "Sweet, calm and a little stubborn, with long ears and an incredible sense of smell.",
      pt: "Doce, calmo e um pouco teimoso, com orelhas longas e um olfato incrível.",
    },
    facts: {
      en: [
        "Origin: France",
        "Size: Medium (20–29 kg)",
        "Lifespan: 10–12 years",
        "Fun fact: Their long ears help sweep scents toward their nose.",
      ],
      pt: [
        "Origem: França",
        "Tamanho: Médio (20–29 kg)",
        "Expectativa de vida: 10–12 anos",
        "Curiosidade: As orelhas compridas ajudam a levar os cheiros até o nariz.",
      ],
    },
  },
  Dachshund: {
    name: "Dachshund",
    img: "dachshund.png",
    desc: {
      en: "Long body, short legs and a big, curious personality. Playful, brave and a bit dramatic.",
      pt: "Corpo comprido, patas curtas e uma personalidade grande e curiosa. Brincalhão, corajoso e um pouco dramático.",
    },
    facts: {
      en: [
        "Origin: Germany",
        "Size: Small to medium (4–15 kg, depending on the variety)",
        "Lifespan: 12–16 years",
        "Fun fact: 'Dachshund' means 'badger dog' in German, because they were bred to hunt badgers.",
      ],
      pt: [
        "Origem: Alemanha",
        "Tamanho: Pequeno a médio (4–15 kg, dependendo da variedade)",
        "Expectativa de vida: 12–16 anos",
        "Curiosidade: 'Dachshund' significa 'cão texugo' em alemão, porque foram criados para caçar texugos.",
      ],
    },
  },
  "Bull Terrier": {
    name: "Bull Terrier",
    img: "bullterrier.png",
    desc: {
      en: "Muscular, playful and goofy, with a unique egg-shaped head. Very affectionate with its family.",
      pt: "Musculoso, brincalhão e engraçado, com uma cabeça única em formato de ovo. Muito carinhoso com a família.",
    },
    facts: {
      en: [
        "Origin: England",
        "Size: Medium (18–29 kg)",
        "Lifespan: 11–14 years",
        "Fun fact: Their egg-shaped head is one of the most recognizable features in the dog world.",
      ],
      pt: [
        "Origem: Inglaterra",
        "Tamanho: Médio (18–29 kg)",
        "Expectativa de vida: 11–14 anos",
        "Curiosidade: A cabeça em formato de ovo é uma das características mais reconhecíveis do mundo canino.",
      ],
    },
  },
  Bernese: {
    name: "Bernese Mountain Dog",
    img: "bernese.png",
    desc: {
      en: "Big, fluffy and sweet-natured. Bernese are calm, loyal family dogs with a beautiful tri-color coat.",
      pt: "Grande, peludo e de temperamento doce. Os bernes são cães de família calmos e leais, com uma linda pelagem tricolor.",
    },
    facts: {
      en: [
        "Origin: Switzerland",
        "Size: Large (35–55 kg)",
        "Lifespan: 7–10 years",
        "Fun fact: They were farm dogs in the Swiss Alps, used to pull carts and herd cattle.",
      ],
      pt: [
        "Origem: Suíça",
        "Tamanho: Grande (35–55 kg)",
        "Expectativa de vida: 7–10 anos",
        "Curiosidade: Eram cães de fazenda nos Alpes suíços, usados para puxar carroças e conduzir o gado.",
      ],
    },
  },
  "Bohemian Shepherd": {
    name: "Bohemian Shepherd",
    img: "bohemianshepherd.png",
    desc: {
      en: "A loyal, alert and intelligent herding dog from the Czech Republic. Quick to learn and very devoted to its family.",
      pt: "Um cão pastor leal, atento e inteligente da República Tcheca. Aprende rápido e é muito dedicado à família.",
    },
    facts: {
      en: [
        "Origin: Czech Republic (Bohemia)",
        "Size: Medium (14–25 kg)",
        "Lifespan: 12–14 years",
        "Fun fact: They were traditionally used by the Chods people to guard the border between Bohemia and Bavaria.",
      ],
      pt: [
        "Origem: República Tcheca (Boêmia)",
        "Tamanho: Médio (14–25 kg)",
        "Expectativa de vida: 12–14 anos",
        "Curiosidade: Eram usados tradicionalmente pelo povo Chod para vigiar a fronteira entre a Boêmia e a Baviera.",
      ],
    },
  },
  "Border Collie": {
    name: "Border Collie",
    img: "bordercollie.png",
    desc: {
      en: "Often called the smartest dog breed. Extremely energetic, athletic and great at learning tricks.",
      pt: "Muitas vezes chamado de a raça mais inteligente. Super enérgico, atlético e ótimo para aprender truques.",
    },
    facts: {
      en: [
        "Origin: United Kingdom (England–Scotland border)",
        "Size: Medium (14–20 kg)",
        "Lifespan: 12–15 years",
        "Fun fact: They control sheep with an intense stare known as 'the eye'.",
      ],
      pt: [
        "Origem: Reino Unido (fronteira entre Inglaterra e Escócia)",
        "Tamanho: Médio (14–20 kg)",
        "Expectativa de vida: 12–15 anos",
        "Curiosidade: Eles controlam as ovelhas com um olhar intenso conhecido como 'the eye' (o olhar).",
      ],
    },
  },
  "Chinese Crested": {
    name: "Chinese Crested",
    img: "chinesecrested.png",
    desc: {
      en: "A small, elegant and playful companion with a flowing crest of hair. It comes in two types: hairless and powderpuff.",
      pt: "Um companheiro pequeno, elegante e brincalhão, com uma crista de pelos esvoaçante. Existem dois tipos: pelado e powderpuff (com pelagem completa).",
    },
    facts: {
      en: [
        "Origin: China",
        "Size: Small (2–6 kg)",
        "Lifespan: 13–18 years",
        "Fun fact: Hairless and powderpuff puppies can be born in the same litter.",
      ],
      pt: [
        "Origem: China",
        "Tamanho: Pequeno (2–6 kg)",
        "Expectativa de vida: 13–18 anos",
        "Curiosidade: Filhotes pelados e powderpuff podem nascer na mesma ninhada.",
      ],
    },
  },
  Corgi: {
    name: "Corgi",
    img: "corgi.png",
    desc: {
      en: "Short legs, big ears and a huge personality. Corgis are smart, friendly and love to herd everything.",
      pt: "Pernas curtas, orelhas grandes e uma personalidade enorme. Os corgis são inteligentes, simpáticos e adoram pastorear tudo.",
    },
    facts: {
      en: [
        "Origin: Wales",
        "Size: Small to medium (10–14 kg)",
        "Lifespan: 12–14 years",
        "Fun fact: 'Corgi' means 'dwarf dog' in Welsh, and they were bred to herd cattle by nipping at their heels.",
      ],
      pt: [
        "Origem: País de Gales",
        "Tamanho: Pequeno a médio (10–14 kg)",
        "Expectativa de vida: 12–14 anos",
        "Curiosidade: 'Corgi' significa 'cão anão' em galês, e eles foram criados para conduzir o gado mordiscando os calcanhares.",
      ],
    },
  },
  Dachshund: {
    name: "Dachshund",
    img: "dachshund.png",
    desc: {
      en: "Long body, short legs and a big, curious personality. Playful, brave and a bit dramatic.",
      pt: "Corpo comprido, patas curtas e uma personalidade grande e curiosa. Brincalhão, corajoso e um pouco dramático.",
    },
    facts: {
      en: [
        "Origin: Germany",
        "Size: Small to medium (4–15 kg, depending on the variety)",
        "Lifespan: 12–16 years",
        "Fun fact: 'Dachshund' means 'badger dog' in German, because they were bred to hunt badgers.",
      ],
      pt: [
        "Origem: Alemanha",
        "Tamanho: Pequeno a médio (4–15 kg, dependendo da variedade)",
        "Expectativa de vida: 12–16 anos",
        "Curiosidade: 'Dachshund' significa 'cão texugo' em alemão, porque foram criados para caçar texugos.",
      ],
    },
  },
  Dalmatian: {
    name: "Dalmatian",
    img: "dalmatian.png",
    desc: {
      en: "Famous for its black spots. Energetic, athletic and loyal, with lots of stamina.",
      pt: "Famoso pelas manchas pretas. Enérgico, atlético e leal, com muita resistência.",
    },
    facts: {
      en: [
        "Origin: Croatia (Dalmatia region)",
        "Size: Medium to large (20–32 kg)",
        "Lifespan: 11–13 years",
        "Fun fact: Puppies are born white and their spots appear as they grow. They once ran alongside horse-drawn carriages.",
      ],
      pt: [
        "Origem: Croácia (região da Dalmácia)",
        "Tamanho: Médio a grande (20–32 kg)",
        "Expectativa de vida: 11–13 anos",
        "Curiosidade: Os filhotes nascem brancos e as manchas aparecem conforme crescem. Eles já correram ao lado de carruagens.",
      ],
    },
  },
  Golden: {
    name: "Golden Retriever",
    img: "golden.png",
    desc: {
      en: "Friendly, gentle and eager to please. One of the most popular family dogs in the world.",
      pt: "Amigável, gentil e ansioso para agradar. Um dos cães de família mais populares do mundo.",
    },
    facts: {
      en: [
        "Origin: Scotland (United Kingdom)",
        "Size: Large (25–34 kg)",
        "Lifespan: 10–12 years",
        "Fun fact: They were bred to retrieve ducks, with a water-repellent coat and a 'soft mouth' that carries game gently.",
      ],
      pt: [
        "Origem: Escócia (Reino Unido)",
        "Tamanho: Grande (25–34 kg)",
        "Expectativa de vida: 10–12 anos",
        "Curiosidade: Foram criados para buscar patos, com uma pelagem que repele água e uma 'boca macia' que carrega a caça com delicadeza.",
      ],
    },
  },
  Pitbull: {
    name: "Pit Bull",
    img: "pitbull.png",
    desc: {
      en: "Muscular, energetic and very devoted. With training and socialization, pit bulls can be affectionate family dogs.",
      pt: "Musculoso, enérgico e muito dedicado. Com treino e socialização, os pit bulls podem ser cães de família carinhosos.",
    },
    facts: {
      en: [
        "Origin: United States / United Kingdom",
        "Size: Medium (14–27 kg)",
        "Lifespan: 12–14 years",
        "Fun fact: 'Pit bull' is a general name for a group of related terrier breeds, such as the American Pit Bull Terrier.",
      ],
      pt: [
        "Origem: Estados Unidos / Reino Unido",
        "Tamanho: Médio (14–27 kg)",
        "Expectativa de vida: 12–14 anos",
        "Curiosidade: 'Pit bull' é um nome geral para um grupo de raças terrier parecidas, como o American Pit Bull Terrier.",
      ],
    },
  },
  // 👉 paste your new breed block here (after adding a comma after the "}" above)
};

// Other names the AI class might have, mapped to a key from breedData above. Optional.
const extraAliases = {
  "Yorkshire Terrier": "Yorkshire",
  Yorkie: "Yorkshire",
  Basset: "Basset Hound",
  "Italian Grey Hound": "Italian Greyhound",
  Whippet: "Italian Greyhound",
  "Bohemian Sheperd": "Bohemian Shepherd",
  "Bernese Mountain Dog": "Bernese",
  "Pit Bull": "Pitbull",
  "Golden Retriever": "Golden",
};
/* ---------------------------------------------------------------------
   4. DOG FACTS (the "Random dog fact" button). Add more lines any time.
   --------------------------------------------------------------------- */
const dogFacts = [
  {
    en: "A dog's nose print is unique, just like a human fingerprint.",
    pt: "A marca do focinho de um cachorro é única, como a impressão digital de uma pessoa.",
  },
  {
    en: "A Border Collie named Chaser learned the names of more than 1,000 toys.",
    pt: "Uma Border Collie chamada Chaser aprendeu o nome de mais de 1.000 brinquedos.",
  },
  {
    en: "Puppies are born with their eyes and ears closed. They start to see and hear after about two weeks.",
    pt: "Os filhotes nascem com olhos e ouvidos fechados. Eles começam a ver e ouvir depois de cerca de duas semanas.",
  },
  {
    en: "Dalmatian puppies are born completely white. Their spots appear later.",
    pt: "Os filhotes de dálmata nascem totalmente brancos. As manchas aparecem depois.",
  },
  {
    en: "Greyhounds can run at about 70 km/h (45 mph).",
    pt: "Os galgos conseguem correr a cerca de 70 km/h.",
  },
  {
    en: "Dogs sweat mostly through their paw pads and cool down by panting.",
    pt: "Os cachorros suam principalmente pelas almofadinhas das patas e se refrescam ofegando.",
  },
  {
    en: "The Basenji almost never barks. It makes a yodel-like sound instead.",
    pt: "O Basenji quase nunca late. Ele faz um som parecido com um canto tirolês.",
  },
  {
    en: "Dogs have REM sleep, so those twitchy paws might mean they're dreaming.",
    pt: "Os cachorros têm sono REM, então aquelas patinhas se mexendo podem significar que estão sonhando.",
  },
  {
    en: "Dogs follow human pointing gestures better than chimpanzees do.",
    pt: "Os cachorros entendem gestos de apontar melhor do que os chimpanzés.",
  },
];

/* ---------------------------------------------------------------------
   5. UPCOMING FEATURES CARD. Add or remove blocks. "id" must be unique.
   --------------------------------------------------------------------- */
const upcoming = [
  {
    id: "breeds",
    title: { en: "More breeds", pt: "Mais raças" },
    desc: {
      en: "Training the AI with many more dog breeds.",
      pt: "Treinando a IA com muito mais raças de cachorro.",
    },
  },
  {
    id: "camflip",
    title: { en: "Camera flip on mobile", pt: "Trocar câmera no celular" },
    desc: {
      en: "Switch between the front and back camera.",
      pt: "Alternar entre a câmera frontal e a traseira.",
    },
  },
];

/* ---------------------------------------------------------------------
   6. SITE TEXTS (en = English, pt = Portuguese).
   Change the words inside the quotes only. Keep things like {breed}.
   --------------------------------------------------------------------- */
const i18n = {
  en: {
    title: "The Puppy Project - A Dog Breed Detector",
    intro:
      "This project is an AI-powered dog breed detector that identifies a dog's breed through an uploaded image or webcam. It was created to explore image recognition and machine learning while making technology accessible, interactive, and fun!",
    start: "Start! ⚞^. .^⚟",
    dropHint:
      " Drag & drop a dog photo anywhere on this card, or click here to upload",
    topGuesses: "Top 3 guesses",
    unsure: "Hmm, I'm not very sure about this one…",
    learnMore: "Learn about {breed} ",
    factBtn: "Random dog fact ",
    breedsTitle: "Meet the Breeds",
    breedsHint: "Click a photo to learn more about each breed",
    aboutTitle: "About the Creator",
    aboutText:
      "Hi! I'm Livia, a high school student from Brazil studying Systems Development at ETEC. I'm passionate about technology, programming, and exploring how artificial intelligence can be used creatively to solve everyday problems!",
    meet: "Meet the creator .⋆❀°",
    creatorBio:
      "High school student from Brazil, studying Systems Development at ETEC. I love building things that mix code, creativity and AI. Dogs are a bonus. 🐶",
    upcomingTitle: "Upcoming features",
    upcomingHint:
      "Vote for what you want to see next! (For now, votes are saved only on this device.)",
    vote: " I want this",
    voted: "✓ Voted",
    suggestTitle: "Suggestions",
    suggestIntro:
      "Missing a breed? Got a feature idea or found a bug? Tell me!",
    sugName: "Your name (optional)",
    sugTypeBreed: "Breed request",
    sugTypeFeature: "Feature idea",
    sugTypeBug: "Bug report",
    sugMsg: "Write your suggestion…",
    sugSend: "Send ",
    sugThanks: "Thanks! Your suggestion was sent ",
    sugError: "Something went wrong. Please try again.",
    loadingModel: "Loading the AI model…",
    modelError: "Couldn't load the AI model. Check MODEL_URL in script.js.",
    camError: "Couldn't access the webcam. Check your browser permissions.",
    notImage: "Please choose an image file.",
    notFound:
      " I couldn't identify this breed. It may not have been added yet, or the photo isn't clear enough. Try another photo or suggest the breed below!",
    notAdded:
      "This looks like {breed}, but that breed hasn't been added to the site yet ",
    notDog: " Hmm, that doesn't look like a dog! Try a photo of a dog ",
  },
  pt: {
    title: "The Puppy Project - Um Detector de Raças de Cachorro ₍^. .^₎Ⳋ",
    intro:
      "Este projeto é um detector de raças de cachorro com IA que identifica a raça de um cachorro por uma imagem enviada ou pela webcam. Ele foi criado para explorar reconhecimento de imagem e machine learning, deixando a tecnologia acessível, interativa e divertida!",
    start: "Começar! ⚞^. .^⚟",
    dropHint:
      " Arraste uma foto de cachorro para qualquer lugar deste cartão, ou clique aqui para enviar",
    topGuesses: "Top 3 palpites",
    unsure: "Hmm, não tenho muita certeza sobre este…",
    learnMore: "Saiba mais sobre {breed}  ",
    factBtn: "Curiosidade aleatória ",
    breedsTitle: "Conheça as Raças",
    breedsHint: "Clique em uma foto para saber mais sobre cada raça",
    aboutTitle: "Sobre a Criadora",
    aboutText:
      "Oi! Eu sou a Livia, estudante do ensino médio no Brasil, cursando Desenvolvimento de Sistemas na ETEC. Sou apaixonada por tecnologia, programação e por explorar como a inteligência artificial pode ser usada de forma criativa para resolver problemas do dia a dia!",
    meet: "Conheça a criadora .⋆❀°",
    creatorBio:
      "Estudante do ensino médio no Brasil, cursando Desenvolvimento de Sistemas na ETEC. Adoro criar coisas que misturam código, criatividade e IA. Cachorros são um bônus. 🐶",
    upcomingTitle: "Próximas novidades",
    upcomingHint:
      "Vote no que você quer ver em seguida! (Por enquanto, os votos ficam salvos só neste dispositivo.)",
    vote: " Eu quero isso",
    voted: "✓ Votado",
    suggestTitle: "Sugestões",
    suggestIntro:
      "Faltou uma raça? Tem uma ideia de recurso ou achou um bug? Me conta!",
    sugName: "Seu nome (opcional)",
    sugTypeBreed: "Pedido de raça",
    sugTypeFeature: "Ideia de recurso",
    sugTypeBug: "Reportar bug",
    sugMsg: "Escreva sua sugestão…",
    sugSend: "Enviar ",
    sugThanks: "Obrigada! Sua sugestão foi enviada ",
    sugError: "Algo deu errado. Tente novamente.",
    loadingModel: "Carregando o modelo de IA…",
    modelError:
      "Não consegui carregar o modelo de IA. Confira o MODEL_URL no script.js.",
    camError:
      "Não consegui acessar a webcam. Confira as permissões do navegador.",
    notImage: "Por favor, escolha um arquivo de imagem.",
    notFound:
      " Não consegui identificar esta raça. Ela pode não ter sido adicionada ainda, ou a foto não está clara o bastante. Tente outra foto ou sugira a raça lá embaixo!",
    notAdded:
      "Parece ser {breed}, mas essa raça ainda não foi adicionada ao site ",
    notDog: " Hmm, isso não parece um cachorro! Tente uma foto de um cachorro ",
  },
};

/* ============================== START ==============================
   Keep this at the very end (it needs everything above to be defined). */
buildBreedLookup();
setupCreator();
loadModel();
applyLang();
