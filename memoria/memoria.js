import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, setDoc,
  onSnapshot, query, orderBy
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

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const MEM  = collection(db, "memorias");
const CONF = doc(db, "config", "memoria");

/* true  = los nombres esperan aprobación en ?v=mod antes de salir en pantalla
   false = salen directo (el panel sigue sirviendo para quitarlos) */
const MODERAR = false;
const ESTADO_INICIAL = MODERAR ? "pending" : "live";

const $ = id => document.getElementById(id);
let todas = [], abierto = true;

/* ---------- vistas ----------
   (sin nada)     → celular del público, la del QR
   ?v=proyeccion  → pantalla del proyector
   ?v=mod         → panel del equipo
------------------------------- */
const params = new URLSearchParams(location.search);
const v = (params.get("v") || "").toLowerCase();
const vista = { proyeccion: "proyeccion", pantalla: "proyeccion", mod: "mod", moderacion: "mod" }[v] || "celular";
$(vista).hidden = false;

onSnapshot(query(MEM, orderBy("ts", "asc")), snap => {
  todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (vista === "proyeccion") pintarCampo();
  if (vista === "mod") pintarMod();
}, err => console.error(err));

onSnapshot(CONF, s => {
  abierto = !s.exists() || s.data().open !== false;
  if (vista === "celular") pintarCelular();
  if (vista === "mod") pintarMod();
});

const fechas = r => [r.nacio, r.partio].filter(Boolean).join(" · ");

/* ================= PROYECCIÓN ================= */
if (vista === "proyeccion") {
  const escena = $("escena");
  const encajar = () => {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    escena.style.transform = `scale(${k}) translate(-640px,-360px)`;
  };
  addEventListener("resize", encajar); encajar();

  // abierta desde el celular (botón "Ver el muro"): botón de volver y aviso de girar
  if (params.get("cel") === "1") {
    $("volver").hidden = false;
    const girar = () => { $("girar").hidden = innerWidth > innerHeight; };
    addEventListener("resize", girar); girar();
  }

  // dirección que se muestra debajo del QR (la imagen qr-memoria.png apunta a /memoria)
  const url = location.origin + "/memoria";
  document.querySelectorAll("[data-url]").forEach(el => el.textContent = url.replace(/^https?:\/\//, ""));

  // brasas que suben
  [110, 240, 380, 520, 640, 780, 900, 1030, 1160].forEach((x, i) => {
    const b = document.createElement("div"); b.className = "brasa";
    b.style.cssText = `left:${x}px;bottom:${80 + (i % 4) * 25}px;animation-delay:${(i * 0.8).toFixed(1)}s`;
    $("brasas").appendChild(b);
  });

  // fila de velas apagadas; la del centro encendida
  for (let i = 0, N = 17, mid = 8; i < N; i++) {
    const c = i === mid, vela = document.createElement("div");
    vela.className = "vela-fila cera";
    vela.style.cssText = `width:${c ? 30 : 16 + (i * 5) % 7}px;height:${c ? 96 : 34 + (i * 11) % 26}px;opacity:${c ? 1 : Math.max(.45, 1 - Math.abs(i - mid) * .06)}`;
    vela.innerHTML = c ? '<div class="mecha"></div><div class="halo"></div><div class="llama"></div>'
                       : `<div class="mecha"></div><div class="humo" style="animation-delay:${((i * .53) % 4.5).toFixed(2)}s"></div>`;
    $("velas").appendChild(vela);
  }
}

/* 15 puestos en 3 filas: adelante grandes, atrás pequeñas y tenues.
   El puesto 0 es el de la lápida más nueva. */
const FILAS = [
  { cx: [500, 800, 205, 1095],                 y: 36,  s: 1,   o: 1,   z: 30, lejos: false },
  { cx: [650, 360, 940, 95, 1185],             y: 180, s: .75, o: .78, z: 20, lejos: false },
  { cx: [520, 720, 330, 905, 150, 1085],       y: 345, s: .52, o: .55, z: 10, lejos: true  },
];
const GIROS = [-2.2, 1.4, -.8, 2, -1.6, .9];
const armarPuestos = filas => filas.flatMap((f, fi) => f.cx.map((cx, i) => ({
  x: cx + [-8, 12, -6, 10, -4, 8][i] - 92, y: f.y + ((i * 13) % 17) - 8, s: f.s, o: f.o, z: f.z, lejos: f.lejos,
  r: GIROS[(i + fi) % GIROS.length],
})));

/* Visto desde el celular de quien acaba de enviar (&id=...): su lápida va sola
   al centro de la fila de adelante (sin giro) y las demás se reparten alrededor. */
const MIA = params.get("id");
const PUESTOS = armarPuestos(MIA
  ? [{ ...FILAS[0], cx: [640, 330, 950] }, FILAS[1], FILAS[2]]
  : FILAS);
if (MIA) PUESTOS[0].x = 640 - 92, PUESTOS[0].r = 0;
const enPantalla = new Map();   // id -> elemento
let primeraVez = true;

function crearLapida(r) {
  const el = document.createElement("div");
  el.className = "lapida";
  el.innerHTML = '<div class="piedra"><div class="nombre"></div><div class="fechas"></div><div class="linea"></div><div class="mensaje"></div><div class="de"></div></div><div class="vela cera"><div class="halo"></div><div class="llama"></div></div>';
  const q = s => el.querySelector(s);
  q(".nombre").textContent = r.nombre || "";
  q(".fechas").textContent = fechas(r);
  q(".fechas").hidden = !fechas(r);
  q(".mensaje").textContent = r.mensaje || "";
  q(".mensaje").hidden = q(".linea").hidden = !r.mensaje;
  q(".de").textContent = r.de ? "de " + r.de : "";
  q(".de").hidden = !r.de;
  q(".llama").style.animationDelay = (Math.random() * 1.6).toFixed(2) + "s";
  if (r.id === MIA) el.classList.add("mia");
  return el;
}
const colocar = (el, p, extraY = 0) => {
  el.style.transform = `translate(${p.x}px, ${-p.y + extraY}px) scale(${p.s}) rotate(${p.r}deg)`;
  el.style.zIndex = p.z;
  el.classList.toggle("lejos", p.lejos);
};

function pintarCampo() {
  const vivas = todas.filter(r => r.status === "live");
  $("contador").textContent = todas.filter(r => r.status === "live" || r.status === "archived").length;
  $("escena").classList.toggle("vacio", vivas.length === 0);

  let visibles = vivas.slice().reverse();                     // la más nueva primero
  const mia = visibles.find(r => r.id === MIA);
  if (mia) visibles = [mia, ...visibles.filter(r => r !== mia)]; // la suya siempre en el puesto 0
  visibles = visibles.slice(0, PUESTOS.length);
  const ids = new Set(visibles.map(r => r.id));

  // las que ya no caben (o se quitaron) se desvanecen
  for (const [id, el] of enPantalla) if (!ids.has(id)) {
    el.style.opacity = 0; enPantalla.delete(id);
    setTimeout(() => el.remove(), 1700);
  }
  // con 4 o menos, la fila de adelante se centra en vez de cargarse a un lado
  const pocas = visibles.length <= 4 && !MIA;
  visibles.forEach((r, i) => {
    const p = pocas
      ? { ...PUESTOS[i], x: 640 + (visibles.length - 1 - i - (visibles.length - 1) / 2) * 300 - 92 }
      : PUESTOS[i];
    let el = enPantalla.get(r.id);
    if (!el) {
      // nace abajo e invisible, y sube a su puesto
      el = crearLapida(r);
      const entra = !primeraVez || r.id === MIA;   // la suya entra con animación aunque sea la primera carga
      colocar(el, p, entra ? 90 : 0);
      el.style.opacity = 0;
      $("lapidas").appendChild(el);
      enPantalla.set(r.id, el);
      el.getBoundingClientRect();
      if (entra) { el.classList.add("nueva"); setTimeout(() => el.classList.remove("nueva"), 7000); }
    }
    colocar(el, p);
    el.style.opacity = p.o;
  });
  primeraVez = false;
}

/* ================= CELULAR ================= */
function pintarCelular() {
  const enviado = !$("encendida").hidden;
  $("cerrado").hidden = abierto;
  $("formulario").hidden = !abierto || enviado;
  if (!abierto) $("encendida").hidden = true;
}
if (vista === "celular") {
  const f = { nombre: $("fNombre"), nacio: $("fNacio"), partio: $("fPartio"), mensaje: $("fMensaje"), de: $("fDe") };
  const error = msg => { $("fError").textContent = msg; $("fError").hidden = !msg; };
  f.mensaje.addEventListener("input", () => {
    const n = f.mensaje.value.length;
    $("fCuenta").textContent = `${n} / 90`;
    $("fCuenta").classList.toggle("lleno", n >= 90);
  });
  [f.nacio, f.partio].forEach(i => i.addEventListener("input", () => { i.value = i.value.replace(/\D/g, ""); }));

  $("fEnviar").addEventListener("click", async () => {
    const d = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    const hoy = new Date().getFullYear();
    const anioMalo = a => a && (!/^\d{4}$/.test(a) || +a < 1850 || +a > hoy);
    if (!d.nombre) { error("Escribe el nombre de tu ser querido."); f.nombre.focus(); return; }
    if (anioMalo(d.nacio) || anioMalo(d.partio)) { error("Revisa los años: deben tener 4 números."); return; }
    if (d.nacio && d.partio && +d.partio < +d.nacio) { error("El año en que partió no puede ser antes del que nació."); return; }
    error("");
    $("fEnviar").disabled = true;
    try {
      const ref = await addDoc(MEM, { ...d, status: ESTADO_INICIAL, ts: Date.now() });
      // sin moderación, pasa directo a ver el muro con su lápida al centro
      if (!MODERAR) { location.href = `/memoria?v=proyeccion&cel=1&id=${ref.id}`; return; }
      $("eNombre").textContent = d.nombre;
      $("eBajada").textContent = MODERAR
        ? "En unos momentos aparecerá en la pantalla. Esta noche la recordamos contigo."
        : "Levanta la mirada. Esta noche la recordamos contigo.";
      Object.values(f).forEach(el => el.value = "");
      $("fCuenta").textContent = "0 / 90";
      $("formulario").hidden = true;
      $("encendida").hidden = false;
      scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      error("No se pudo enviar. Revisa tu conexión e inténtalo otra vez.");
    }
    $("fEnviar").disabled = false;
  });
  $("eOtra").addEventListener("click", () => {
    $("encendida").hidden = true; pintarCelular(); f.nombre.focus();
  });
}

/* ================= MODERACIÓN ================= */
function item(r, botones) {
  const d = document.createElement("div"); d.className = "m-item";
  const t = document.createElement("div"); t.className = "txt";
  [["n", r.nombre], ["m", r.mensaje], ["d", [fechas(r), r.de && "de " + r.de].filter(Boolean).join(" · ")]]
    .forEach(([c, txt]) => { if (!txt) return; const e = document.createElement("div"); e.className = c; e.textContent = txt; t.appendChild(e); });
  d.appendChild(t);
  botones.forEach(([txt, status]) => {
    const b = document.createElement("button"); b.className = "mini"; b.textContent = txt;
    b.onclick = () => updateDoc(doc(db, "memorias", r.id), { status });
    d.appendChild(b);
  });
  return d;
}
function pintarMod() {
  const pend = todas.filter(r => r.status === "pending");
  const vivas = todas.filter(r => r.status === "live").reverse();
  $("mEstado").textContent = (abierto ? "Participación abierta" : "Participación cerrada") + ` · ${vivas.length} en pantalla`;
  $("mAbrir").textContent = abierto ? "Cerrar participación" : "Abrir participación";
  $("mTituloPend").hidden = !pend.length;
  $("mPendientes").replaceChildren(...pend.map(r => item(r, [["Aprobar", "live"], ["Descartar", "rejected"]])));
  $("mLista").replaceChildren(...(vivas.length ? vivas.map(r => item(r, [["Quitar", "archived"]]))
    : [Object.assign(document.createElement("p"), { className: "vacio-txt", textContent: "Aún no hay nombres." })]));
}
if (vista === "mod") {
  onAuthStateChanged(auth, u => { $("mGate").hidden = !!u; $("mPanel").hidden = !u; });
  const entrar = async () => {
    $("mError").hidden = true; $("mEntrar").disabled = true;
    try { await signInWithEmailAndPassword(auth, $("mMail").value.trim(), $("mPass").value); }
    catch { $("mError").hidden = false; }
    $("mEntrar").disabled = false;
  };
  $("mEntrar").addEventListener("click", entrar);
  [$("mMail"), $("mPass")].forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") entrar(); }));
  $("mSalir").addEventListener("click", () => signOut(auth));
  $("mAbrir").addEventListener("click", () => setDoc(CONF, { open: !abierto }));
}
