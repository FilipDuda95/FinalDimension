/* =========================================================
   CurvedScreen — libovolný kus HTML na zahnutém monitoru.

   Bez knihoven, bez buildu. Stačí připojit tenhle soubor
   a zavolat CurvedScreen({ ... }).

   Jak to funguje:
   Tvůj obsah se naklonuje do N svislých proužků (lamel).
   Každá lamela ukazuje jen svůj výřez obsahu a je pootočená
   kolem svislé osy, takže všechny dohromady tvoří válec —
   dutou obrazovku jako u curved monitoru.

   Použití:

     <div id="obal"></div>

     <template id="obsah">
       ...tvoje HTML...
     </template>

     <script src="curved-screen.js"><\/script>
     <script>
       var monitor = CurvedScreen({
         mount:   "#obal",
         content: "#obsah"
       });
     <\/script>

   Chceš na monitor rovnou celou svoji hotovou stránku?
   Místo content dej page — každá lamela si ji načte v iframe:

       CurvedScreen({ mount: "#obal", page: "index.html" });

   (Zpětné lomítko v <\/script> je tam schválně: kdybys tenhle soubor vložil
    přímo do stránky dovnitř značky script, ukončila by ji jinak už tahle
    ukázka tady v komentáři. Ve svém HTML lomítko nepiš.)

   Autor: napsáno pro kamaráda, dělej si s tím co chceš.
   ========================================================= */

(function (global) {
  "use strict";

  /* ---------- styly (vloží se do stránky jen jednou) ---------- */

  var STYLE_ID = "curved-screen-styl";

  var STYLE = [
    ".cs-root{ position:relative; width:100%; }",

    /* .cs-fit zmenšuje celou scénu, aby se vešla do šířky obalu */
    ".cs-fit{ position:absolute; left:50%; top:0; transform-origin:50% 0; }",

    ".cs-stage{ perspective:2200px; perspective-origin:50% 46%; }",

    ".cs-stage{ touch-action:none; }",
    ".cs-stage.cs-can-drag{ cursor:grab; }",
    ".cs-stage.cs-dragging{ cursor:grabbing; }",

    /* Klíčové pro klikání: obal i podložka leží v prostoru na z=0, kdežto
       prostřední lamely jsou kvůli zakřivení kousek za nimi. Prohlížeč by
       je tak při hledání cíle kliku zastínil — proto do nich myš nepouštíme
       a necháváme reagovat jen samotné lamely. */
    ".cs-rig{ transform-style:preserve-3d; touch-action:none; pointer-events:none; }",

    ".cs-curve{ position:relative; transform-style:preserve-3d; transition:opacity .35s ease; pointer-events:none; }",
    /* dokud se nenačtou všechny lamely, neukazujeme nic — jinak by naskakovaly po jedné */
    ".cs-curve.cs-nacita{ opacity:0; }",

    /* jedna svislá lamela */
    ".cs-slat{ position:absolute; top:0; left:50%; overflow:hidden; backface-visibility:hidden; pointer-events:auto; }",

    /* celý obsah uvnitř lamely — jen posunutý a oříznutý */
    /* user-select vypnutý, ať se při otáčení nezačne označovat text */
    ".cs-inner{ position:absolute; top:0; user-select:none; -webkit-user-select:none; }",
    ".cs-screen{ position:relative; width:100%; height:100%; overflow:hidden; }",
    /* Obal obsahu, kterým se v režimu content roluje (posouvá se celý).
       Flexem zajistíme, že obsah vyplní obrazovku na výšku, ale klidně
       může být i vyšší — pak se dá rolovat. */
    ".cs-posun{ position:relative; min-height:100%; display:flex; flex-direction:column; }",
    ".cs-posun > *{ flex:1 0 auto; }",

    /* režim page: uvnitř je opravdová stránka v iframe.
       pointer-events:none je nutné, jinak by myš klikala do stránky
       místo aby otáčela monitorem. */
    ".cs-iframe{ display:block; border:0; pointer-events:none; background:#fff; }",

    /* ztmavení podle natočení — dělá dojem hloubky */
    ".cs-shade{ position:absolute; inset:0; pointer-events:none; background:#000; }",

    /* odlesk skla */
    ".cs-gloss{ position:absolute; inset:0; pointer-events:none;",
    "  background:linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.02) 18%, rgba(255,255,255,0) 45%); }",

    /* viditelné spáry mezi lamelami */
    ".cs-seams .cs-slat::after{ content:\"\"; position:absolute; inset:0; pointer-events:none;",
    "  box-shadow: inset 1px 0 0 rgba(255,255,255,.07), inset -1px 0 0 rgba(0,0,0,.45); }",

    /* rámeček monitoru — u každé lamely nahoře a dole, dohromady dá souvislý zahnutý rám */
    ".cs-bezel .cs-gloss, .cs-bezel .cs-back{",
    "  border-top:9px solid var(--cs-frame); border-bottom:9px solid var(--cs-frame); }",
    ".cs-bezel .cs-slat.cs-edge-l .cs-gloss{ border-left:9px solid var(--cs-frame); }",
    ".cs-bezel .cs-slat.cs-edge-r .cs-gloss{ border-right:9px solid var(--cs-frame); }",
    ".cs-bezel .cs-gloss{ box-shadow: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(255,255,255,.05); }",

    /* záda monitoru — deska otočená o 180°, vidět je až když monitor otočíš */
    /* pointer-events:none je důležité: zadní deska leží přes obsah a brala by
       mu kliky, i když ji zrovna není vidět */
    ".cs-back{ position:absolute; top:0; left:50%; backface-visibility:hidden; pointer-events:none;",
    "  background: repeating-linear-gradient(180deg, rgba(255,255,255,.022) 0px, rgba(255,255,255,.022) 2px, transparent 2px, transparent 9px),",
    "              linear-gradient(90deg, #0a0e16 0%, #171e2d 50%, #0a0e16 100%); }",

    /* noha monitoru */
    ".cs-stand{ position:absolute; left:50%; top:100%; width:150px; height:78px; margin-left:-75px;",
    "  background:linear-gradient(180deg,#11151f,#0a0d14); clip-path:polygon(34% 0, 66% 0, 78% 100%, 22% 100%); }",
    ".cs-stand::after{ content:\"\"; position:absolute; left:-95px; bottom:-14px; width:340px; height:20px;",
    "  border-radius:50%; background:linear-gradient(180deg,#151a26,#0a0d14); box-shadow:0 12px 40px rgba(0,0,0,.6); }",

    /* rozsvícení obrazovky při načtení */
    "@keyframes cs-power{",
    "  0%{ opacity:0; filter:brightness(3) saturate(0); transform:scaleY(.004); }",
    "  16%{ opacity:1; filter:brightness(3) saturate(0); transform:scaleY(.004); }",
    "  34%{ transform:scaleY(1); filter:brightness(1.7) saturate(.6); }",
    "  52%{ filter:brightness(.7); }",
    "  70%{ filter:brightness(1.25); }",
    "  100%{ filter:brightness(1); transform:scaleY(1); } }",
    ".cs-boot{ animation:cs-power 1.1s ease-out both; }",

    "@media (prefers-reduced-motion: reduce){ .cs-boot{ animation:none; } }"
  ].join("\n");

  function vlozStyly() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  /* ---------- pomocné ---------- */

  function najdi(co) {
    return typeof co === "string" ? document.querySelector(co) : co;
  }

  /* Vrátí funkci, která pokaždé vyrobí čerstvou kopii obsahu.
     Umí <template> i normální element (ten se pak schová). */
  function pripravObsah(zdroj) {
    var e = najdi(zdroj);
    if (!e) throw new Error("CurvedScreen: obsah nenalezen (" + zdroj + ")");

    if (e.tagName === "TEMPLATE") {
      return function () { return e.content.cloneNode(true); };
    }
    e.style.display = "none";
    return function () {
      var kopie = e.cloneNode(true);
      kopie.removeAttribute("id");
      kopie.style.display = "";
      return kopie;
    };
  }

  /* ---------- hlavní funkce ---------- */

  function CurvedScreen(volby) {
    vlozStyly();

    var o = volby || {};

    var nastaveni = {
      width:       o.width       || 1440,   // šířka návrhu obrazovky v px
      height:      o.height      || 810,    // výška návrhu (1440x810 = 16:9)
      slats:       o.slats       || 24,     // počet lamel (víc = hladší oblouk, ale pomalejší)
      arc:         o.arc         != null ? o.arc : 46,   // celkové zakřivení ve stupních (0 = rovná)
      perspective: o.perspective || 2200,   // menší číslo = dramatičtější 3D
      background:  o.background  || "#0b0e14",  // barva pod obsahem (kdyby byl průhledný)
      frame:       o.frame       || "#070a11",  // barva rámečku monitoru

      bezel:       o.bezel     !== false,   // rámeček monitoru
      seams:       o.seams     !== false,   // viditelné spáry mezi lamelami
      gloss:       o.gloss     !== false,   // odlesk skla
      back:        o.back      !== false,   // záda monitoru (vidět po otočení)
      stand:       o.stand     !== false,   // noha monitoru
      boot:        o.boot      !== false,   // rozsvícení při načtení

      interactive: !!o.interactive,         // klikání a rolování uvnitř stránky (jen s page)
      drag:        o.drag      !== false,   // otáčení tažením myši
      inertia:     o.inertia   !== false,   // doběh po puštění myši
      autoSpin:    !!o.autoSpin,            // samovolné otáčení dokola
      spinSpeed:   o.spinSpeed   || 0.25,   // stupňů na snímek
      maxTiltX:    o.maxTiltX    != null ? o.maxTiltX : 75,  // omezení naklonění nahoru/dolů
      maxScale:    o.maxScale    || 1,      // ať se to nezvětšuje nad původní velikost
      standSpace:  o.stand !== false ? 120 : 0  // místo pod obrazovkou na nohu
    };

    // U opravdové stránky v iframe se každá lamela načítá zvlášť,
    // tak ať jich není zbytečně moc.
    if (o.page && o.slats == null) nastaveni.slats = 16;

    /* Odkud brát obsah: buď kus HTML ze stránky (content),
       nebo rovnou celá jiná stránka v iframe (page). */
    var udelejObsah = o.page
      ? function () {
          var ram = document.createElement("iframe");
          ram.className = "cs-iframe";
          ram.src = o.page;
          ram.setAttribute("scrolling", "no");
          ram.setAttribute("tabindex", "-1");
          ram.setAttribute("aria-hidden", "true");
          ram.style.width  = nastaveni.width + "px";
          ram.style.height = nastaveni.height + "px";
          return ram;
        }
      : pripravObsah(o.content);

    var root = najdi(o.mount);
    if (!root) throw new Error("CurvedScreen: obal nenalezen (" + o.mount + ")");

    /* ---------- kostra ---------- */

    root.classList.add("cs-root");
    root.innerHTML = "";

    var fit = document.createElement("div");
    fit.className = "cs-fit";

    var stage = document.createElement("div");
    stage.className = "cs-stage";
    stage.style.perspective = nastaveni.perspective + "px";

    var rig = document.createElement("div");
    rig.className = "cs-rig";

    var curve = document.createElement("div");
    curve.className = "cs-curve";
    curve.style.setProperty("--cs-frame", nastaveni.frame);

    rig.appendChild(curve);
    stage.appendChild(rig);
    fit.appendChild(stage);
    root.appendChild(fit);

    /* ---------- stavba válce ---------- */

    function postav() {
      var W = nastaveni.width;
      var H = nastaveni.height;
      var n = nastaveni.slats;
      var arc = nastaveni.arc;

      var w  = W / n;          // šířka jedné lamely
      var da = arc / n;        // úhel na jednu lamelu

      // Poloměr válce tak, aby na sebe ploché lamely přesně navazovaly.
      // Při zakřivení 0 použijeme obrovský poloměr = rovná obrazovka.
      var R = da > 0.01 ? w / (2 * Math.tan(da * Math.PI / 360)) : 300000;

      // Hloubka "mísy" — o kolik jsou kraje blíž než střed. Válec posuneme
      // o půlku dozadu, aby se otáčel kolem svého středu a při pohledu
      // z boku neujížděl stranou.
      var depth = R * (1 - Math.cos(arc * Math.PI / 360));

      fit.style.width  = W + "px";
      fit.style.height = H + "px";
      curve.style.width  = W + "px";
      curve.style.height = H + "px";

      var frag = document.createDocumentFragment();

      for (var i = 0; i < n; i++) {
        // První lamela (vlevo) má kladný úhel — je natočená doprava dovnitř,
        // takže je obrazovka dutá jako opravdový zahnutý monitor.
        var a = arc / 2 - da * (i + 0.5);

        // Zápis zleva doprava = pořadí odzadu: nejdřív odsun dozadu,
        // pak otočení, a nakonec posun celého válce dopředu.
        var misto =
          "translateZ(" + (R - depth / 2).toFixed(2) + "px) " +
          "rotateY(" + a.toFixed(3) + "deg) " +
          "translateZ(" + (-R).toFixed(2) + "px)";

        var lamela = document.createElement("div");
        lamela.className = "cs-slat";
        lamela.style.width  = (w + 1) + "px";   // +1 px překryv, ať mezi lamelami nejsou vlásečnice
        lamela.style.height = H + "px";
        lamela.style.marginLeft = (-(w + 1) / 2) + "px";
        lamela.style.transform = misto;
        lamela.setAttribute("data-cs-i", i);    // podle toho se pozná, kam uživatel klikl
        if (i === 0)     lamela.classList.add("cs-edge-l");
        if (i === n - 1) lamela.classList.add("cs-edge-r");

        var inner = document.createElement("div");
        inner.className = "cs-inner";
        inner.style.width  = W + "px";
        inner.style.height = H + "px";
        inner.style.left   = (-(i * w) + 0.5) + "px";

        var screen = document.createElement("div");
        screen.className = "cs-screen";
        screen.style.background = nastaveni.background;

        if (o.page) {
          screen.appendChild(udelejObsah());          // stránka v iframe
        } else {
          var posunObal = document.createElement("div");   // obsahem se roluje posunutím
          posunObal.className = "cs-posun";
          posunObal.appendChild(udelejObsah());
          screen.appendChild(posunObal);
        }

        inner.appendChild(screen);
        lamela.appendChild(inner);

        var shade = document.createElement("div");
        shade.className = "cs-shade";
        shade.style.opacity = (Math.abs(a) / 90 * 0.85).toFixed(3);
        lamela.appendChild(shade);

        if (nastaveni.gloss || nastaveni.bezel) {
          var gloss = document.createElement("div");
          gloss.className = "cs-gloss";
          if (!nastaveni.gloss) gloss.style.background = "none";
          lamela.appendChild(gloss);
        }

        frag.appendChild(lamela);

        if (nastaveni.back) {
          var back = document.createElement("div");
          back.className = "cs-back";
          back.style.width  = (w + 1) + "px";
          back.style.height = H + "px";
          back.style.marginLeft = (-(w + 1) / 2) + "px";
          back.style.transform = misto + " rotateY(180deg)";
          frag.appendChild(back);
        }
      }

      if (nastaveni.stand) {
        var noha = document.createElement("div");
        noha.className = "cs-stand";
        frag.appendChild(noha);
      }

      curve.innerHTML = "";
      curve.appendChild(frag);

      curve.classList.toggle("cs-seams", nastaveni.seams);
      curve.classList.toggle("cs-bezel", nastaveni.bezel);

      if (o.page) {
        pockejNaLamely();
      } else {
        obrazovky  = [].slice.call(curve.querySelectorAll(".cs-screen"));
        posunObaly = [].slice.call(curve.querySelectorAll(".cs-posun"));
        zmerObsah();
        nastavPosun(posun);
      }

      prepocitejVelikost();
    }

    /* ---------- sladění lamel ----------
       Každá lamela je vlastní kopie obsahu. Aby se nerozešly, neposílá
       se myš do nich přímo — spočítá se, kam do obsahu uživatel klikl,
       a akce se provede ve všech lamelách naráz. */

    var ramy = [];        // iframy lamel (režim page)
    var obrazovky = [];   // plochy lamel (režim content)
    var posunObaly = [];  // obaly, kterými se v režimu content roluje
    var posun = 0;        // společná pozice odrolování
    var maxPosun = 0;

    function pockejNaLamely() {
      ramy = [].slice.call(curve.querySelectorAll("iframe.cs-iframe"));
      if (!ramy.length) return;

      var zbyva = ramy.length;
      curve.classList.add("cs-nacita");

      ramy.forEach(function (ram) {
        ram.addEventListener("load", function () {
          if (--zbyva > 0) return;
          curve.classList.remove("cs-nacita");
          zmerStranku();
          nastavPosun(posun);        // po překreslení se vrátíme, kde jsme byli
        });
      });
    }

    /* Projde všechny lamely. Když je stránka z cizí domény, prohlížeč
       dovnitř nepustí — pak se prostě nic nesladí a zůstane jen koukání. */
    function proKazdouLamelu(co) {
      for (var i = 0; i < ramy.length; i++) {
        try {
          var d = ramy[i].contentDocument;
          // null = prohlížeč dovnitř vůbec nepustí (jiná doména nebo file:// z disku)
          if (!d) return false;
          if (d.body) co(ramy[i].contentWindow, d, i);
        } catch (e) { return false; }
      }
      return true;
    }

    function zmerStranku() {
      var vyskaStranky = 0;
      var slo = proKazdouLamelu(function (w, d) {
        // odkaz do nového okna by otevřel tolik panelů, kolik je lamel
        var odkazy = d.querySelectorAll("a[target='_blank']");
        for (var i = 0; i < odkazy.length; i++) odkazy[i].removeAttribute("target");
        if (!vyskaStranky) vyskaStranky = d.documentElement.scrollHeight;
      });

      if (!slo && nastaveni.interactive) {
        nastaveni.interactive = false;
        var potiz = location.protocol === "file:"
          ? "Klikání uvnitř nejde, protože je stránka otevřená z disku (file://). Spusť ji přes lokální server — v balíčku je na to spustit.cmd."
          : "Klikání uvnitř nejde: stránka v monitoru je z jiné domény, tam prohlížeč nepustí.";
        if (typeof o.onProblem === "function") o.onProblem(potiz);
        if (window.console) console.warn("CurvedScreen: " + potiz);
      }
      maxPosun = Math.max(0, vyskaStranky - nastaveni.height);
    }

    /* Kolik toho v režimu content je pod okrajem obrazovky. */
    function zmerObsah() {
      maxPosun = posunObaly.length
        ? Math.max(0, posunObaly[0].scrollHeight - nastaveni.height)
        : 0;
    }

    function nastavPosun(kam) {
      posun = Math.max(0, Math.min(maxPosun, kam));
      if (o.page) {
        proKazdouLamelu(function (w) { w.scrollTo(0, posun); });
      } else {
        for (var i = 0; i < posunObaly.length; i++) {
          posunObaly[i].style.transform = "translateY(" + (-posun) + "px)";
        }
      }
    }

    /* Kam uživatel klikl, přepočítané na souřadnice uvnitř obsahu.
       offsetX/offsetY umí prohlížeč spočítat i u otočené lamely. */
    function bodVeStrance(e) {
      var lamela = e.target && e.target.closest ? e.target.closest(".cs-slat") : null;
      if (!lamela) return null;
      var i = +lamela.getAttribute("data-cs-i");
      var w = nastaveni.width / nastaveni.slats;
      return {
        x: i * w + e.offsetX - 0.5,
        // v režimu page je souřadnice v okně iframu, v režimu content v celém obsahu
        y: o.page ? e.offsetY : e.offsetY + posun
      };
    }

    /* Režim page: klik se pošle do všech iframů naráz. */
    function klikniVsude(bod) {
      proKazdouLamelu(function (w, d) {
        var cil = d.elementFromPoint(bod.x, bod.y);
        if (!cil) return;
        ["mousedown", "mouseup", "click"].forEach(function (druh) {
          cil.dispatchEvent(new w.MouseEvent(druh, {
            bubbles: true, cancelable: true, view: w,
            clientX: bod.x, clientY: bod.y
          }));
        });
      });
    }

    /* Režim content: obsah je normální HTML v naší stránce, takže klik
       trefí rovnou správný prvek a obsluha proběhne sama — jen v jedné
       lamele. Ostatní lamely proto podle ní srovnáme. */
    function srovnejKopie(cil) {
      var zdroj = cil && cil.closest ? cil.closest(".cs-screen") : null;
      if (!zdroj) return;

      // setTimeout (ne requestAnimationFrame): musí to proběhnout i tehdy,
      // když je panel prohlížeče na pozadí, kde se snímky nekreslí.
      setTimeout(function () {
        var vzor = zdroj.innerHTML;
        for (var i = 0; i < obrazovky.length; i++) {
          if (obrazovky[i] !== zdroj) obrazovky[i].innerHTML = vzor;
        }
        posunObaly = [].slice.call(curve.querySelectorAll(".cs-posun"));
        nastavPosun(posun);
      }, 0);
    }

    /* ---------- zmenšení, aby se to vešlo do obalu ---------- */

    function prepocitejVelikost() {
      var kDispozici = root.clientWidth || nastaveni.width;
      var s = Math.min(kDispozici / nastaveni.width, nastaveni.maxScale);
      if (!(s > 0)) s = 1;

      fit.style.transform = "translateX(-50%) scale(" + s.toFixed(4) + ")";
      // obal si vyhradí přesně tolik místa, kolik zmenšená scéna zabere
      root.style.height = ((nastaveni.height + nastaveni.standSpace) * s) + "px";
    }

    window.addEventListener("resize", prepocitejVelikost);

    /* ---------- otáčení myší ---------- */

    var rotY = o.startY || 0, rotX = o.startX || 0;
    var velY = 0;
    var tahne = false, lastX = 0, lastY = 0;
    var tazeno = 0;       // o kolik se myš pohnula — podle toho poznáme klik od otáčení
    var bezi = false;

    function pouzij() {
      rig.style.transform = "rotateX(" + rotX.toFixed(2) + "deg) rotateY(" + rotY.toFixed(2) + "deg)";
    }

    function start(e) {
      // klik do ovládacích prvků uvnitř stránky monitorem netočí
      if (e.target.closest && e.target.closest("[data-cs-ignore]")) return;
      tahne = true;
      velY = 0;
      tazeno = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.classList.add("cs-dragging");
    }

    function pohyb(e) {
      if (!tahne) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      tazeno += Math.abs(dx) + Math.abs(dy);

      rotY += dx * 0.35;                     // vodorovně bez omezení — projde celých 360°
      rotX -= dy * 0.25;                     // svisle omezíme, ať se to nepřevrátí
      if (rotX >  nastaveni.maxTiltX) rotX =  nastaveni.maxTiltX;
      if (rotX < -nastaveni.maxTiltX) rotX = -nastaveni.maxTiltX;

      velY = dx * 0.35;
      pouzij();
    }

    function konec() {
      tahne = false;
      stage.classList.remove("cs-dragging");
    }

    function smycka() {
      if (!tahne) {
        var zmena = false;
        if (nastaveni.autoSpin) { rotY += nastaveni.spinSpeed; zmena = true; }
        if (nastaveni.inertia && Math.abs(velY) > 0.02) {
          rotY += velY;
          velY *= 0.94;                      // tření, pohyb postupně vyhasne
          zmena = true;
        }
        if (zmena) pouzij();
      }
      requestAnimationFrame(smycka);
    }

    if (nastaveni.drag) {
      stage.classList.add("cs-can-drag");
      root.addEventListener("pointerdown", start);
      document.addEventListener("pointermove", pohyb);
      document.addEventListener("pointerup", konec);
      document.addEventListener("pointercancel", konec);
    }

    /* ---------- klikání a rolování uvnitř stránky ---------- */

    function kolecko(e) {
      if (!nastaveni.interactive || maxPosun <= 0) return;
      e.preventDefault();               // roluje se stránka v monitoru, ne stránka pod ním
      nastavPosun(posun + e.deltaY);
    }

    function klik(e) {
      if (!nastaveni.interactive) return;
      if (tazeno > 6) return;           // tohle nebyl klik, ale otáčení monitorem
      if (o.page) {
        var bod = bodVeStrance(e);
        if (bod) klikniVsude(bod);
      } else {
        srovnejKopie(e.target);
      }
    }

    /* V režimu content je obsah opravdové HTML, takže by na něj myš
       fungovala i bez nás. To nechceme: když se monitorem točí nebo
       je klikání vypnuté, klik zahodíme dřív, než se k obsahu dostane. */
    function hlidejKlik(e) {
      if (o.page) return;
      if (!nastaveni.interactive || tazeno > 6) {
        e.stopPropagation();
        e.preventDefault();
      }
    }

    root.addEventListener("click", hlidejKlik, true);
    root.addEventListener("wheel", kolecko, { passive: false });
    root.addEventListener("click", klik);

    /* ---------- spuštění ---------- */

    postav();
    pouzij();

    if (nastaveni.boot) {
      curve.classList.add("cs-boot");
      setTimeout(function () { curve.classList.remove("cs-boot"); }, 1300);
    }

    if (!bezi) { bezi = true; requestAnimationFrame(smycka); }

    /* ---------- co se dá ovládat zvenku ---------- */

    return {
      root: root,
      rig: rig,

      /* změna zakřivení za běhu, např. monitor.setArc(70) */
      setArc: function (stupne) { nastaveni.arc = +stupne; postav(); return this; },

      /* změna počtu lamel */
      setSlats: function (pocet) { nastaveni.slats = Math.max(2, Math.round(pocet)); postav(); return this; },

      /* natočení: monitor.setRotation(45, 10) */
      setRotation: function (y, x) {
        rotY = +y || 0;
        if (x != null) rotX = +x;
        velY = 0;
        pouzij();
        return this;
      },

      /* zpátky do čelního pohledu */
      reset: function () { return this.setRotation(0, 0); },

      /* samovolné otáčení zapnout/vypnout: monitor.spin(true) */
      spin: function (zapnout) {
        nastaveni.autoSpin = zapnout == null ? !nastaveni.autoSpin : !!zapnout;
        return this;
      },

      /* klikání a rolování uvnitř stránky zapnout/vypnout */
      interact: function (zapnout) {
        nastaveni.interactive = zapnout == null ? !nastaveni.interactive : !!zapnout;
        return this;
      },

      /* odrolovat stránku uvnitř na danou pozici (všechny lamely společně) */
      scrollPage: function (y) { nastavPosun(+y || 0); return this; },

      /* přepínače vzhledu */
      toggle: function (co, zapnout) {
        if (!(co in nastaveni)) return this;
        nastaveni[co] = zapnout == null ? !nastaveni[co] : !!zapnout;
        postav();
        return this;
      },

      /* překreslit (třeba když se změnil obsah v template) */
      rebuild: postav,

      /* úplné odstranění */
      destroy: function () {
        window.removeEventListener("resize", prepocitejVelikost);
        root.removeEventListener("wheel", kolecko);
        root.removeEventListener("click", klik);
        root.removeEventListener("click", hlidejKlik, true);
        root.removeEventListener("pointerdown", start);
        document.removeEventListener("pointermove", pohyb);
        document.removeEventListener("pointerup", konec);
        document.removeEventListener("pointercancel", konec);
        nastaveni.autoSpin = false;
        nastaveni.inertia = false;
        root.innerHTML = "";
        root.classList.remove("cs-root");
        root.style.height = "";
      }
    };
  }

  global.CurvedScreen = CurvedScreen;

})(window);
