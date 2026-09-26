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

/* La lápida es de quien la escribe: su nombre, el día en que nació, un guion y un "?"
   (nadie sabe cuándo va a morir). Se guarda dia, mes y nacio (año); partio queda vacío. */
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const fechaNac = r => [r.dia && +r.dia, r.mes && MESES[+r.mes - 1], r.nacio].filter(Boolean).join(" ");

/* ================= PROYECCIÓN ================= */
if (vista === "proyeccion") {
  const escena = $("escena");
  let formaActual = 0;
  /* En el proyector (o celular acostado) el escenario es 1280x720.
     En un celular vertical (&cel=1) pasa a un escenario angosto de 420 de ancho
     con la altura que tenga la pantalla, y las lápidas se reacomodan. */
  const encajar = () => {
    const vertical = params.get("cel") === "1" && innerHeight > innerWidth;
    let W = 1280, H = 720, k;
    if (vertical) {
      W = 420; k = innerWidth / W; H = innerHeight / k;
      if (H < 720) { H = 720; k = innerHeight / H; }
    } else k = Math.min(innerWidth / W, innerHeight / H);
    escena.style.width = W + "px"; escena.style.height = H + "px";
    escena.style.transform = `scale(${k}) translate(${-W / 2}px,${-H / 2}px)`;
    const forma = vertical ? Math.round(H) : 0;   // se reacomoda si cambia la orientación o el alto
    if (forma !== formaActual) {
      formaActual = forma;
      $("proyeccion").classList.toggle("vertical", vertical);
      VERTICAL = vertical;
      PUESTOS = calcPuestos(vertical, H);
      pintarCampo();
    }
  };
  addEventListener("resize", encajar);
  setTimeout(encajar);   // después de definir PUESTOS y pintarCampo (más abajo)

  // abierta desde el celular: botón de volver
  if (params.get("cel") === "1") $("volver").hidden = false;

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

/* Visto desde el celular vertical de quien acaba de enviar (&id=...): su lápida va
   grande al centro. En pantalla ancha (computador o celular acostado) se ve igual
   que la proyección; lo único extra es el botón de volver. */
const MIA = params.get("id");
let VERTICAL = false;
/* celular vertical (420 de ancho, alto variable): la suya grande adelante, 2 en el medio
   y 3 atrás, las de atrás solo con el nombre. Medido para 780 de alto; en pantallas
   más altas o más bajas las filas de atrás suben o bajan en proporción. */
const FILAS_VERTICAL = [
  { cx: [210],           y: 100, s: 1.2, o: 1,   z: 30, lejos: false },
  { cx: [100, 320],      y: 370, s: .62, o: .8,  z: 20, lejos: true  },
  { cx: [210, 55, 365],  y: 510, s: .42, o: .55, z: 10, lejos: true  },
];
function calcPuestos(vertical, H) {
  if (vertical) {
    const f = H / 780;
    const p = armarPuestos(FILAS_VERTICAL.map((fila, i) => i ? { ...fila, y: fila.y * f } : fila));
    p[0].x = 210 - 92; p[0].y = 100; p[0].r = 0;
    return p;
  }
  return armarPuestos(FILAS);
}
let PUESTOS = calcPuestos(false);
const enPantalla = new Map();   // id -> elemento
let primeraVez = true;

const PIEDRA = '<div class="piedra"><div class="nombre"></div><div class="linea"></div>' +
  '<div class="fechas"><span class="nac"></span><span class="guion"></span><span class="interrogante">?</span></div></div>';
function llenarPiedra(el, r) {
  el.querySelector(".nombre").textContent = r.nombre || "";
  el.querySelector(".nac").textContent = fechaNac(r);
}

function crearLapida(r) {
  const el = document.createElement("div");
  el.className = "lapida";
  el.innerHTML = PIEDRA + '<div class="vela cera"><div class="halo"></div><div class="llama"></div></div>';
  llenarPiedra(el, r);
  const q = s => el.querySelector(s);
  q(".llama").style.animationDelay = (Math.random() * 1.6).toFixed(2) + "s";
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
  if (mia && VERTICAL) visibles = [mia, ...visibles.filter(r => r !== mia)]; // la suya siempre en el puesto 0
  visibles = visibles.slice(0, PUESTOS.length);
  const ids = new Set(visibles.map(r => r.id));

  // las que ya no caben (o se quitaron) se desvanecen
  for (const [id, el] of enPantalla) if (!ids.has(id)) {
    el.style.opacity = 0; enPantalla.delete(id);
    setTimeout(() => el.remove(), 1700);
  }
  // con 4 o menos, la fila de adelante se centra en vez de cargarse a un lado
  const pocas = visibles.length <= 4 && !VERTICAL;
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
    el.classList.toggle("mia", VERTICAL && r.id === MIA);
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
  const f = { nombre: $("fNombre"), dia: $("fDia"), mes: $("fMes"), nacio: $("fAnio") };
  const error = msg => { $("fError").textContent = msg; $("fError").hidden = !msg; };
  [f.dia, f.nacio].forEach(i => i.addEventListener("input", () => { i.value = i.value.replace(/\D/g, ""); }));

  // vista previa de la lápida mientras escribe
  $("fPrevia").innerHTML = PIEDRA;
  const previa = () => {
    const d = { nombre: f.nombre.value.trim(), dia: f.dia.value, mes: f.mes.value, nacio: f.nacio.value };
    llenarPiedra($("fPrevia"), { nombre: d.nombre || "Tu nombre", dia: d.dia || "", mes: d.mes, nacio: d.nacio.length === 4 ? d.nacio : "" });
    if (!d.dia && !d.mes && d.nacio.length < 4) $("fPrevia").querySelector(".nac").textContent = "DÍA MES AÑO";
    $("fPrevia").classList.toggle("sin-nombre", !d.nombre);
  };
  Object.values(f).forEach(el => el.addEventListener("input", previa));
  previa();

  $("fEnviar").addEventListener("click", async () => {
    const d = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    const hoy = new Date();
    if (!d.nombre) { error("Escribe tu nombre completo."); f.nombre.focus(); return; }
    const dia = +d.dia, mes = +d.mes, anio = +d.nacio;
    const nac = new Date(anio, mes - 1, dia);
    if (!dia || !mes || !/^\d{4}$/.test(d.nacio)) { error("Escribe el día, el mes y el año en que naciste."); return; }
    if (anio < 1900 || nac.getDate() !== dia || nac.getMonth() !== mes - 1 || nac > hoy) { error("Revisa tu fecha de nacimiento."); return; }
    error("");
    $("fEnviar").disabled = true;
    try {
      // mensaje, de y partio van vacíos: las reglas de Firestore todavía los piden
      const ref = await addDoc(MEM, {
        nombre: d.nombre, dia: String(dia).padStart(2, "0"), mes: d.mes, nacio: d.nacio,
        partio: "", mensaje: "", de: "", status: ESTADO_INICIAL, ts: Date.now()
      });
      // sin moderación, pasa directo a ver el muro con su lápida al centro
      if (!MODERAR) { location.href = `/memoria?v=proyeccion&cel=1&id=${ref.id}`; return; }
      $("eNombre").textContent = d.nombre.split(" ")[0];
      $("eBajada").textContent = "En unos momentos aparecerá en la pantalla. Nadie sabe el día ni la hora.";
      Object.values(f).forEach(el => el.value = "");
      previa();
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
  [["n", r.nombre], ["d", (fechaNac(r) || "") + " — ?"]]
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
