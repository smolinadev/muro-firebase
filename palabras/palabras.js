import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, updateDoc, setDoc, getDocs, writeBatch,
  onSnapshot, query, orderBy, limit, increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxtpEEgIH5pikKxz2F9d4fQm818uDSuLw",
  authDomain: "muro-cnv-dd1f8.firebaseapp.com",
  projectId: "muro-cnv-dd1f8",
  storageBucket: "muro-cnv-dd1f8.firebasestorage.app",
  messagingSenderId: "799549856460",
  appId: "1:799549856460:web:9d92790cbb83c3e554c069"
};

const app    = initializeApp(firebaseConfig);
const db     = getFirestore(app);
const auth   = getAuth(app);
const PAL    = collection(db, "palabras");
const CONF   = doc(db, "config", "palabras");
const CONTEO = doc(db, "conteos", "palabras");   // total de participaciones (n)

const MAX_LETRAS = 20;
const EN_PANTALLA = 20;

/* Palabras que no se publican. Se comparan ya normalizadas (minúsculas, sin tildes).
   Están aquí y no en la base de datos para no gastar lecturas. */
const BLOQUEADAS = [
  "puta", "putas", "puto", "putos", "hijueputa", "hijueputas", "hijodeputa", "hp", "jueputa",
  "gonorrea", "gonorreas", "malparido", "malparida", "malparidos", "marica", "marico", "maricon", "maricones",
  "pendejo", "pendeja", "pendejos", "mierda", "mierdas", "culo", "culos", "verga", "vergas", "careverga",
  "mamaverga", "carechimba", "cabron", "cabrona", "perra", "zorra", "idiota", "idiotas", "estupido", "estupida",
  "imbecil", "huevon", "guevon", "webon", "pene", "polla", "cono", "follar", "porno",
  "violador", "nazi", "hitler",
];

/* minúsculas, sin tildes ni diacríticos (la ñ queda como n), sin espacios ni signos.
   Es el ID del documento: "Esperanza", "esperanza " y "ESPERANZA" caen en el mismo. */
const normalizar = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const $ = id => document.getElementById(id);
let abierto = true, ronda = 0, confLista = false;

/* ---------- vistas ----------
   (sin nada)     → celular del público, la del QR
   ?v=proyeccion  → pantalla del proyector
   ?v=mod         → panel del equipo
------------------------------- */
const params = new URLSearchParams(location.search);
const v = (params.get("v") || "").toLowerCase();
const vista = { proyeccion: "proyeccion", pantalla: "proyeccion", mod: "mod", moderacion: "mod" }[v] || "celular";
$(vista).hidden = false;

/* un voto por dispositivo y por ronda ("Limpiar muro" sube la ronda) */
const claveVoto = () => "palabras:voto:" + ronda;
const leerVoto = () => { try { return localStorage.getItem(claveVoto()); } catch { return null; } };
const guardarVoto = p => { try { localStorage.setItem(claveVoto(), p); } catch {} };

onSnapshot(CONF, s => {
  const d = s.exists() ? s.data() : {};
  abierto = d.open !== false;
  ronda = d.ronda || 0;
  const primera = !confLista; confLista = true;
  if (vista === "celular") pintarCelular(primera);
  if (vista === "mod") pintarMod();
});

/* Suma un voto. Primero intenta sumar a la palabra existente; si no existe, la crea
   con votos: 1; y si justo otra persona la creó al mismo tiempo, vuelve a sumar. */
async function votar(id, texto) {
  const ref = doc(db, "palabras", id);
  try {
    await updateDoc(ref, { votos: increment(1) });
  } catch {
    try { await setDoc(ref, { texto, votos: 1, estado: "visible", ts: Date.now() }); }
    catch { await updateDoc(ref, { votos: increment(1) }); }
  }
  setDoc(CONTEO, { n: increment(1) }, { merge: true }).catch(e => console.error(e));
}

/* ================= PROYECCIÓN ================= */
const MIA = normalizar(params.get("pal") || "");
const DESDE_CEL = params.get("cel") === "1";
let VERTICAL = false, escala = 1;

if (vista === "proyeccion") {
  const escena = $("escena");
  /* 1280x720 en el proyector (o celular acostado); en un celular vertical (&cel=1)
     el escenario pasa a 420 de ancho con la altura que tenga la pantalla. */
  const encajar = () => {
    const vertical = DESDE_CEL && innerHeight > innerWidth;
    let W = 1280, H = 720, k;
    if (vertical) {
      W = 420; k = innerWidth / W; H = innerHeight / k;
      if (H < 720) { H = 720; k = innerHeight / H; }
    } else k = Math.min(innerWidth / W, innerHeight / H);
    escena.style.width = W + "px"; escena.style.height = H + "px";
    escena.style.transform = `scale(${k}) translate(${-W / 2}px,${-H / 2}px)`;
    escala = k;
    if (vertical !== VERTICAL) { VERTICAL = vertical; $("proyeccion").classList.toggle("vertical", vertical); }
    pintarNube(false);
  };
  addEventListener("resize", encajar);

  if (DESDE_CEL) {
    $("desdeCel").hidden = false;
    if (MIA) { $("tuya").hidden = false; $("tuyaTxt").textContent = params.get("pal"); }
  }

  const url = location.origin + "/palabras";
  document.querySelectorAll("[data-url]").forEach(el => el.textContent = url.replace(/^https?:\/\//, ""));

  // brasas que suben
  [110, 240, 380, 520, 640, 780, 900, 1030, 1160].forEach((x, i) => {
    const b = document.createElement("div"); b.className = "brasa";
    b.style.cssText = `left:${x}px;bottom:${80 + (i % 4) * 25}px;animation-delay:${(i * 0.8).toFixed(1)}s`;
    $("brasas").appendChild(b);
  });
  // pantalla de espera: palabras de ejemplo que suben muy tenues
  ["esperanza", "memoria", "perdón", "abrazo", "paz", "escucha", "dignidad", "ternura", "vida", "valentía"].forEach((p, i) => {
    const f = document.createElement("div"); f.className = "fantasma"; f.textContent = p;
    f.style.cssText = `left:${60 + i * 118}px;bottom:${(i * 37) % 120}px;font-size:${26 + (i * 13) % 30}px;animation-delay:${-(i * 1.4).toFixed(1)}s`;
    $("fantasmas").appendChild(f);
  });

  // solo las más votadas; las ocultas se filtran aquí para no necesitar índice compuesto
  onSnapshot(query(PAL, orderBy("votos", "desc"), limit(30)), snap => {
    palabras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pintarNube(true);
  }, err => console.error(err));

  let conteoPrevio = null;
  onSnapshot(CONTEO, s => {
    const n = s.exists() ? s.data().n || 0 : 0, b = $("contador");
    b.textContent = n;
    if (conteoPrevio !== null && n > conteoPrevio) { b.classList.remove("sube"); b.getBoundingClientRect(); b.classList.add("sube"); }
    conteoPrevio = n;
  });

  setTimeout(encajar);
}

let palabras = [];
const enNube = new Map();   // id -> { el, votos }
let primeraCarga = true;

/* tamaño = MIN + (MAX - MIN) * (votos / votosDelMayor)^0.6
   El exponente comprime el rango: la de 1 voto sigue leyéndose junto a la de 20.
   Con 1 o 2 palabras el máximo es intermedio, para que no llene la pantalla. */
function tamano(votos, mayor, cuantas) {
  const MIN = VERTICAL ? 18 : 22, MAX = VERTICAL ? 72 : 130;
  const tope = cuantas >= 3 ? MAX : MIN + (MAX - MIN) * (cuantas === 2 ? .68 : .48);
  return MIN + (tope - MIN) * Math.pow(votos / mayor, 0.6);
}

function crearPalabra(r) {
  const el = document.createElement("div"); el.className = "palabra";
  const f = document.createElement("div"); f.className = "flota";
  f.style.animationDelay = -(Math.random() * 7).toFixed(2) + "s";
  const t = document.createElement("span"); t.className = "txt";
  f.appendChild(t); el.appendChild(f);
  return el;
}

// reinicia una animación CSS aunque ya esté corriendo
const animar = (el, clase, ms) => {
  el.classList.remove(clase); el.getBoundingClientRect(); el.classList.add(clase);
  clearTimeout(el["_t" + clase]); el["_t" + clase] = setTimeout(() => el.classList.remove(clase), ms);
};
function celebrar(el, cuantos) {
  animar(el, "late", 1700);
  const f = el.firstChild;
  const m = document.createElement("div"); m.className = "mas1"; m.textContent = "+" + cuantos;
  f.appendChild(m); setTimeout(() => m.remove(), 1700);
  for (let i = 0; i < 10; i++) {
    const c = document.createElement("div"); c.className = "chispa-v";
    const a = (i / 10) * Math.PI * 2 + Math.random() * .4, d = 50 + Math.random() * 60;
    c.style.setProperty("--dx", (Math.cos(a) * d * 1.6).toFixed(0) + "px");
    c.style.setProperty("--dy", (Math.sin(a) * d).toFixed(0) + "px");
    c.style.animationDelay = (Math.random() * .12).toFixed(2) + "s";
    f.appendChild(c); setTimeout(() => c.remove(), 1300);
  }
}

/* La más votada va sola en el centro; las demás se reparten arriba y abajo,
   alternando, con las más grandes pegadas al centro. Si no caben, todo se achica
   un poco hasta que quepa. Los cambios de puesto y tamaño se animan con FLIP. */
function pintarNube(hayDatos) {
  if (vista !== "proyeccion") return;
  const lista = palabras.filter(r => r.estado !== "oculta" && r.votos > 0 && !BLOQUEADAS.includes(r.id))
    .sort((a, b) => b.votos - a.votos || a.ts - b.ts)   // empate: gana la que llegó primero
    .slice(0, EN_PANTALLA);
  $("escena").classList.toggle("vacio", lista.length === 0);

  // antes de mover nada: dónde está cada palabra ahora
  const antes = new Map();
  for (const [id, o] of enNube) antes.set(id, o.el.getBoundingClientRect());

  const ids = new Set(lista.map(r => r.id));
  for (const [id, o] of enNube) if (!ids.has(id)) { o.el.remove(); enNube.delete(id); }

  const mayor = lista.length ? lista[0].votos : 1;
  const arriba = [], abajo = [];
  lista.slice(1).forEach((r, i) => (i % 2 ? arriba : abajo).push(r));
  arriba.reverse();   // arriba se apila hacia el centro: las grandes quedan al final

  const colocar = (r, padre) => {
    let o = enNube.get(r.id);
    if (!o) { o = { el: crearPalabra(r), votos: r.votos, nueva: true }; enNube.set(r.id, o); }
    const el = o.el;
    el.querySelector(".txt").textContent = r.texto || r.id;
    el.classList.toggle("primera", r === lista[0]);
    el.classList.toggle("mia", DESDE_CEL && r.id === MIA);
    el.style.transition = "none"; el.style.transform = "none";
    el._base = tamano(r.votos, mayor, lista.length);
    padre.appendChild(el);
    return o;
  };
  if (lista[0]) colocar(lista[0], $("nCentro"));
  arriba.forEach(r => colocar(r, $("nArriba")));
  abajo.forEach(r => colocar(r, $("nAbajo")));

  // achica todo hasta que quepa (medido sin transformaciones: offsetTop/Left)
  const bloques = [$("nArriba"), $("nCentro"), $("nAbajo")];
  const cabe = () => bloques.every(b => [...b.children].every(c =>
    c.offsetTop >= -1 && c.offsetLeft >= -1 &&
    c.offsetTop + c.offsetHeight <= b.clientHeight + 1 && c.offsetLeft + c.offsetWidth <= b.clientWidth + 1));
  let k = 1;
  for (let i = 0; i < 25; i++) {
    for (const o of enNube.values()) o.el.querySelector(".txt").style.fontSize = (o.el._base * k).toFixed(1) + "px";
    if (cabe()) break;
    k *= .93;
  }

  // FLIP: cada palabra arranca donde estaba y se desliza/crece a su nuevo puesto
  for (const [id, o] of enNube) {
    const el = o.el, a = antes.get(id);
    if (a && !o.nueva) {
      const b = el.getBoundingClientRect();
      if (b.width && (Math.abs(a.left - b.left) > .5 || Math.abs(a.top - b.top) > .5 || Math.abs(a.width - b.width) > .5)) {
        el.style.transform = `translate(${(a.left - b.left) / escala}px,${(a.top - b.top) / escala}px) scale(${a.width / b.width},${a.height / b.height})`;
        el.getBoundingClientRect();
        el.style.transition = "transform 1.1s cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "none";
      }
    }
  }

  // animaciones: palabra nueva o voto nuevo (no en la primera carga ni al cambiar de tamaño la ventana)
  const r0 = new Map(lista.map(r => [r.id, r]));
  for (const [id, o] of enNube) {
    const r = r0.get(id);
    if (hayDatos && !primeraCarga) {
      if (o.nueva) animar(o.el, "entra", 1400);
      else if (r.votos > o.votos) celebrar(o.el, r.votos - o.votos);
    } else if (o.nueva && DESDE_CEL && id === MIA) celebrar(o.el, 1);   // la suya brilla al llegar
    o.votos = r.votos; o.nueva = false;
  }
  if (hayDatos) primeraCarga = false;
}

/* ================= CELULAR ================= */
function pintarCelular(primera) {
  const ya = leerVoto();
  if (ya && abierto && primera && params.get("ya") !== "1") {
    // ya votó: pasa directo al muro
    location.replace(`/palabras?v=proyeccion&cel=1&pal=${encodeURIComponent(ya)}`);
    return;
  }
  $("cerrado").hidden = abierto;
  $("listo").hidden = !abierto || !ya;
  $("formulario").hidden = !abierto || !!ya;
  if (ya) {
    $("lPalabra").textContent = ya;
    $("lVer").href = `/palabras?v=proyeccion&cel=1&pal=${encodeURIComponent(ya)}`;
  }
}
if (vista === "celular") {
  const inp = $("fPalabra");
  const error = msg => { $("fError").textContent = msg; $("fError").hidden = !msg; if (msg) animar(inp, "sacude", 450); };
  const cuenta = () => { $("fCuenta").textContent = `${inp.value.length}/${MAX_LETRAS}`; };
  const marcarChips = () => document.querySelectorAll(".chip").forEach(c =>
    c.classList.toggle("on", normalizar(c.textContent) === normalizar(inp.value)));

  inp.addEventListener("input", () => {
    if (/\s/.test(inp.value)) { inp.value = inp.value.replace(/\s+/g, ""); error("Una sola palabra, sin espacios."); }
    else error("");
    cuenta(); marcarChips();
  });

  // hasta 6 palabras de otras personas, en orden al azar y sin votos (una sola lectura)
  getDocs(query(PAL, orderBy("votos", "desc"), limit(30))).then(snap => {
    const ops = snap.docs.map(d => d.data())
      .filter(d => d.estado !== "oculta" && d.texto && !BLOQUEADAS.includes(normalizar(d.texto)));
    for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
    const elegidas = ops.slice(0, 6);
    if (!elegidas.length) return;
    $("fChips").replaceChildren(...elegidas.map(d => {
      const c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.textContent = d.texto;
      c.onclick = () => { inp.value = d.texto; cuenta(); marcarChips(); error(""); };   // solo la escribe; se vota con el botón
      return c;
    }));
    $("fSugerencias").hidden = false;
  }).catch(e => console.error(e));

  const enviar = async () => {
    const texto = inp.value.trim().toLowerCase(), id = normalizar(texto);
    if (!texto) { error("Escribe una palabra."); inp.focus(); return; }
    if (!/^\p{L}+$/u.test(texto)) { error("Usa solo letras, sin espacios ni signos."); return; }
    if (!id || texto.length > MAX_LETRAS) { error("Revisa tu palabra."); return; }
    if (BLOQUEADAS.includes(id)) { error("Esa palabra no se puede publicar. Prueba con otra."); return; }
    if (!abierto) return;
    error("");
    $("fEnviar").disabled = true;
    try {
      await votar(id, texto);
      guardarVoto(texto);
      location.href = `/palabras?v=proyeccion&cel=1&pal=${encodeURIComponent(texto)}`;
      return;
    } catch (e) {
      console.error(e);
      error("No se pudo enviar. Revisa tu conexión e inténtalo otra vez.");
    }
    $("fEnviar").disabled = false;
  };
  $("fEnviar").addEventListener("click", enviar);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); });
}

/* ================= MODERACIÓN ================= */
let todas = [], total = 0;
function item(r, botones) {
  const d = document.createElement("div"); d.className = "m-item";
  const t = document.createElement("div"); t.className = "txt-m";
  const n = document.createElement("div"); n.className = "n"; n.textContent = r.texto || r.id;
  const c = document.createElement("div"); c.className = "d"; c.textContent = r.votos === 1 ? "1 voto" : `${r.votos} votos`;
  t.append(n, c); d.appendChild(t);
  botones.forEach(([txt, estado]) => {
    const b = document.createElement("button"); b.className = "mini"; b.textContent = txt;
    b.onclick = () => updateDoc(doc(db, "palabras", r.id), { estado });
    d.appendChild(b);
  });
  return d;
}
function pintarMod() {
  if (vista !== "mod") return;
  const visibles = todas.filter(r => r.estado !== "oculta"), ocultas = todas.filter(r => r.estado === "oculta");
  $("mEstado").textContent = (abierto ? "Participación abierta" : "Participación cerrada") +
    ` · ${visibles.length} palabras · ${total} participaciones`;
  $("mAbrir").textContent = abierto ? "Cerrar participación" : "Abrir participación";
  $("mLista").replaceChildren(...(visibles.length ? visibles.map(r => item(r, [["Ocultar", "oculta"]]))
    : [Object.assign(document.createElement("p"), { className: "vacio-txt", textContent: "Aún no hay palabras." })]));
  $("mTituloOcultas").hidden = !ocultas.length;
  $("mOcultas").replaceChildren(...ocultas.map(r => item(r, [["Mostrar", "visible"]])));
}
if (vista === "mod") {
  onAuthStateChanged(auth, u => { $("mGate").hidden = !!u; $("mPanel").hidden = !u; });
  onSnapshot(query(PAL, orderBy("votos", "desc")), snap => {
    todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pintarMod();
  }, err => console.error(err));
  onSnapshot(CONTEO, s => { total = s.exists() ? s.data().n || 0 : 0; pintarMod(); });

  const entrar = async () => {
    $("mError").hidden = true; $("mEntrar").disabled = true;
    try { await signInWithEmailAndPassword(auth, $("mMail").value.trim(), $("mPass").value); }
    catch { $("mError").hidden = false; }
    $("mEntrar").disabled = false;
  };
  $("mEntrar").addEventListener("click", entrar);
  [$("mMail"), $("mPass")].forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") entrar(); }));
  $("mSalir").addEventListener("click", () => signOut(auth));
  $("mAbrir").addEventListener("click", () => setDoc(CONF, { open: !abierto }, { merge: true }));

  // votos de prueba, uno cada ~0,6 s, para ver la animación en la proyección
  const PRUEBA = ["esperanza", "esperanza", "esperanza", "esperanza", "paz", "paz", "paz", "memoria", "memoria",
    "perdón", "perdón", "abrazo", "dignidad", "escucha", "ternura", "valentía", "comunidad", "gratitud", "vida", "reconciliación"];
  $("mSimular").addEventListener("click", async () => {
    const b = $("mSimular"); b.disabled = true;
    for (let i = 0; i < 18; i++) {
      const t = PRUEBA[Math.floor(Math.random() * PRUEBA.length)];
      b.textContent = `Simulando… ${i + 1}/18`;
      try { await votar(normalizar(t), t); } catch (e) { console.error(e); }
      await new Promise(r => setTimeout(r, 400 + Math.random() * 500));
    }
    b.textContent = "Simular público"; b.disabled = false;
  });

  // borra todas las palabras, pone el contador en 0 y sube la ronda
  // (así cada celular puede volver a votar). Pide un segundo toque para confirmar.
  let confirmar = 0;
  $("mLimpiar").addEventListener("click", async () => {
    const b = $("mLimpiar");
    if (Date.now() - confirmar > 4000) {
      confirmar = Date.now(); b.textContent = "¿Seguro? Toca otra vez para borrar todo"; b.classList.add("confirma");
      setTimeout(() => { if (Date.now() - confirmar >= 4000) { b.textContent = "Limpiar muro"; b.classList.remove("confirma"); } }, 4100);
      return;
    }
    confirmar = 0; b.disabled = true; b.textContent = "Limpiando…";
    try {
      for (let i = 0; i < todas.length; i += 400) {
        const lote = writeBatch(db);
        todas.slice(i, i + 400).forEach(r => lote.delete(doc(db, "palabras", r.id)));
        await lote.commit();
      }
      await setDoc(CONTEO, { n: 0 });
      await setDoc(CONF, { ronda: ronda + 1 }, { merge: true });
    } catch (e) { console.error(e); }
    b.disabled = false; b.textContent = "Limpiar muro"; b.classList.remove("confirma");
  });
}
