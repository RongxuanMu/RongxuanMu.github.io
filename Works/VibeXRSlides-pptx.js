// VibeXR Sharing Slides as an editable PowerPoint deck (same content as Works/VibeXRSlides.html).
// Writes Resources/vibexr-framework/VibeXR-Sharing-Slides.pptx. Needs pptxgenjs (npm) and the pptx skill's apply_theme.js:
//   NODE_PATH=<dir with pptxgenjs>/node_modules node Works/VibeXRSlides-pptx.js
const pptxgen = require("pptxgenjs");
const path = require("path");
const { applyTheme } = require("/root/.claude/skills/synced/30caf771-47c5-47ea-b8e5-3f36ee319bd0_f574db63-e7f9-4bf6-8266-eb69a9cc2c29/pptx/scripts/apply_theme.js");

const REPO = "/home/user/RongxuanMu.github.io";
const OUT = path.join(REPO, "Resources/vibexr-framework/VibeXR-Sharing-Slides.pptx");
const img = (p) => path.join(REPO, p);
const fs = require("fs");
const poster = (p) => "image/jpeg;base64," + fs.readFileSync(img(p)).toString("base64");

// dark deck: dk1 is the light text, lt1 the near-black background
const THEME = {
  name: "VibeXR Night",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "F4F5F7", lt1: "050608", dk2: "A3A8B0", lt2: "14171C",
    accent1: "7FB2FF", accent2: "FFCC66", accent3: "4A505A", accent4: "2A2F37", accent5: "DFE6F3", accent6: "7F8A9C",
    hlink: "7FB2FF", folHlink: "A3A8B0"
  }
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "VibeXR Sharing Slides";
pres.author = "Rongxuan Mu";
pres.subject = "WebXR, today's frameworks, and the VibeXR approach";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// - layouts: a cover and a content frame (kicker + title placeholders, footer, slide number) -
pres.defineSlideMaster({
  title: "VX_COVER",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 1.55, w: 4.2, h: 0.35, fontSize: 12, bold: true, color: C.accent1, charSpacing: 3, valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.95, w: 4.2, h: 1.0, fontSize: 60, bold: true, color: C.text1, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 3.05, w: 4.1, h: 1.3, fontSize: 20, color: C.text1, valign: "top", margin: 0 }, text: "" } }
  ]
});
pres.defineSlideMaster({
  title: "VX_CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.4, w: 8.8, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 3, valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.7, w: 8.8, h: 0.85, fontSize: 30, bold: true, color: C.text1, align: "left", valign: "top", margin: 0 }, text: "" } },
    { text: { text: "VibeXR · Rongxuan Mu", options: { x: 0.6, y: 5.2, w: 4, h: 0.25, fontSize: 9, color: C.text2, margin: 0 } } }
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.4, h: 0.25, fontSize: 9, color: C.text2, align: "right" }
});

// - building blocks -
let nObj = 0;
const id = (s) => `${s}-${++nObj}`;
function card(s, x, y, w, h, { tag, title, body, big } = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.accent3, width: 1 }, objectName: id("card") });
  const runs = [];
  if (big) runs.push({ text: big, options: { fontSize: 34, bold: true, color: C.text1, breakLine: true } });
  if (tag) runs.push({ text: tag.toUpperCase(), options: { fontSize: 10, bold: true, color: C.accent2, charSpacing: 1.5, breakLine: true } });
  if (title) runs.push({ text: title, options: { fontSize: 16, bold: true, color: C.text1, breakLine: true, paraSpaceAfter: 4 } });
  if (body) runs.push({ text: body, options: { fontSize: 13, color: C.text2 } });
  s.addText(runs, { x: x + 0.18, y: y + 0.14, w: w - 0.36, h: h - 0.28, valign: "top", margin: 0, isTextBox: true, objectName: id("card-text") });
}
function node(s, x, y, w, h, title, small, hi = false) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: hi ? C.accent1 : C.accent3, width: hi ? 2 : 1 }, objectName: id("node") });
  s.addText([{ text: title, options: { fontSize: 14, bold: true, color: C.text1, breakLine: !!small } }, ...(small ? [{ text: small, options: { fontSize: 10, color: C.text2 } }] : [])],
    { x: x + 0.06, y, w: w - 0.12, h, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: id("node-text") });
}
function arrow(s, x1, y, x2) {
  s.addShape(pres.shapes.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color: C.accent3, width: 1.5, endArrowType: "triangle" }, objectName: id("arrow") });
}
function bullets(s, x, y, w, h, items, size = 15) {
  s.addText(items.map(([b, t], i) => ({ text: "", options: {} }) && [
    { text: `${b} `, options: { bold: true, color: C.text1, bullet: { code: "2014" }, breakLine: false } },
    { text: t, options: { color: C.text2, breakLine: i < items.length - 1 } }
  ]).flat(), { x, y, w, h, fontSize: size, valign: "top", margin: 0, paraSpaceAfter: 9, isTextBox: true, objectName: id("bullets") });
}
function content(section, kicker, title, notes) {
  const s = pres.addSlide({ masterName: "VX_CONTENT", sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  return s;
}

// 1 - cover
pres.addSection({ title: "Opening" });
{
  const s = pres.addSlide({ masterName: "VX_COVER", sectionTitle: "Opening" });
  // the playground in a headset: plays in the slide (click it, or set it to start automatically in PowerPoint)
  s.addMedia({ type: "video", path: img("Resources/vibexr-framework/VibeXRFramework.mp4"), cover: poster("Resources/vibexr-framework/VibeXRFramework.jpg"), x: 5.0, y: 1.55, w: 4.4, h: 4.4 * 9 / 16, objectName: "cover-video" });
  s.addText("SHARING · OCTOBER 2026", { placeholder: "kicker" });
  s.addText("VibeXR", { placeholder: "title" });
  s.addText("An interaction framework for vibe-coded WebXR. From a link to hands-on XR in one HTML file.", { placeholder: "body" });
  s.addText([{ text: "Rongxuan Mu · " , options: { color: C.text2 } }, { text: "rongxuanmu.com", options: { color: C.accent1, hyperlink: { url: "https://rongxuanmu.com" } } }],
    { x: 0.6, y: 4.75, w: 5, h: 0.3, fontSize: 12, margin: 0, isTextBox: true, objectName: "cover-byline" });
  s.addNotes("VibeXR is the interaction framework under all my browser XR prototypes. Today: what WebXR is, why it's hard to build for, and how VibeXR makes every new idea start from interaction that already feels right.");
}

// 2 - what is WebXR
pres.addSection({ title: "WebXR" });
{
  const s = content("WebXR", "01 · WebXR", "The browser's door into headsets",
    "WebXR is a web standard: a page asks the browser for an immersive session and gets head pose, input and a render loop. No install, no store.");
  s.addText("WebXR is the web standard that lets a page take over a headset: open a link, tap Enter, you are in.",
    { x: 0.6, y: 1.55, w: 8.8, h: 0.6, fontSize: 16, color: C.text2, margin: 0, isTextBox: true, objectName: "lead" });
  const cw = (8.8 - 2 * 0.3) / 3;
  [["Sessions", "VR and AR", "immersive-vr for full immersion, immersive-ar for the room through passthrough."],
   ["Input", "Hands to gaze", "Head pose, controllers, tracked hands with 25 joints, and gaze-and-pinch on Vision Pro."],
   ["Reach", "No install", "Quest, PICO, Vision Pro, Galaxy XR and Android XR browsers. A URL is the whole distribution."]]
    .forEach(([tag, title, body], i) => card(s, 0.6 + i * (cw + 0.3), 2.4, cw, 2.35, { tag, title, body }));
}

// 3 - why prototype on the web
{
  const s = content("WebXR", "02 · Why it matters", "The fastest loop from idea to headset",
    "The loop is the point: say an idea, get one HTML file, push or paste it, refresh in the headset. Minutes, not builds.");
  const nw = 1.85, gap = 0.47;
  [["Idea", "said out loud"], ["One HTML file", "written with AI"], ["Push or paste", "GitHub Pages · CodePen"], ["Headset", "refresh and try"]].forEach(([t, sm], i) => {
    const x = 0.6 + i * (nw + gap);
    node(s, x, 1.75, nw, 0.85, t, sm, i === 3);
    if (i < 3) arrow(s, x + nw + 0.06, 2.175, x + nw + gap - 0.06);
  });
  bullets(s, 0.6, 3.0, 8.8, 1.9, [
    ["Minutes, not builds:", "edit, refresh in the headset, feel it."],
    ["Shareable:", "a link works on someone else's device the same day."],
    ["AI-friendly:", "models write HTML and three.js fluently; a single file is easy to read, diff and paste."]
  ]);
}

// 4 - common frameworks
pres.addSection({ title: "The problem" });
{
  const s = content("The problem", "03 · What's out there", "Good engines, thin interaction",
    "These are all good at what they are for. What none of them hands you is interaction that already feels right on every input.");
  const head = (t) => ({ text: t, options: { bold: true, color: C.accent1, fontSize: 11, charSpacing: 1 } });
  const rows = [
    ["three.js", "Rendering, a light WebXR manager", "Rays, grabs, pokes, UI, hand logic: all of it"],
    ["A-Frame", "HTML-like scenes, quick starts", "Polished near / far interaction across inputs"],
    ["Babylon.js", "A full engine with XR features", "Weight and an engine's way of doing things"],
    ["React Three Fiber + xr", "Pointer events in XR, React", "An npm / bundler toolchain around every idea"],
    ["Unity WebXR export", "Familiar tools and assets", "Heavy builds, slow iteration in a browser"]
  ];
  s.addTable([
    [head("FRAMEWORK"), head("STRONG AT"), head("WHAT YOU STILL BUILD YOURSELF")],
    ...rows.map(([a, b, c]) => [{ text: a, options: { bold: true, color: C.text1 } }, { text: b, options: { color: C.text2 } }, { text: c, options: { color: C.text2 } }])
  ], { x: 0.6, y: 1.6, w: 8.8, colW: [2.2, 3.0, 3.6], fontSize: 13, rowH: 0.48, valign: "middle", margin: [0, 0.08, 0, 0.08],
    border: { type: "solid", pt: 0.75, color: HEX.accent4 }, fill: { color: C.background1 }, objectName: "frameworks" });
}

// 5 - where it hurts
{
  const s = content("The problem", "04 · The problems", "Every prototype rebuilds the same things",
    "The same five things come back on every project. Interaction especially: a ray, a pinch, a grab, a poke and a button, written again each time.");
  const items = [
    ["Interaction is left to you", "ray, pinch, grab, poke, two-hand scale and buttons, written again for each project."],
    ["Inputs diverge", "hands, controllers, Vision Pro's gaze pointer and a desktop mouse each behave differently."],
    ["VR-first habits", "passthrough is an afterthought, and \"VR only\" makes no sense on see-through glasses."],
    ["Toolchains get in the way", "npm, bundlers and frameworks, while AI works best with one file you can paste."],
    ["No desk testing", "without a headset on, you can't try the interaction at all."]
  ];
  items.forEach(([b, t], i) => {
    const y = 1.62 + i * 0.68;
    s.addShape(pres.shapes.OVAL, { x: 0.6, y: y + 0.02, w: 0.42, h: 0.42, fill: { color: C.background2 }, line: { color: C.accent1, width: 1.25 }, objectName: id("num") });
    s.addText(String(i + 1), { x: 0.6, y: y + 0.02, w: 0.42, h: 0.42, fontSize: 13, bold: true, color: C.accent1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: id("num-text") });
    s.addText([{ text: `${b}: `, options: { bold: true, color: C.text1 } }, { text: t, options: { color: C.text2 } }],
      { x: 1.2, y, w: 8.2, h: 0.46, fontSize: 14, valign: "middle", margin: 0, isTextBox: true, objectName: id("pain") });
  });
}

// 6 - the idea
pres.addSection({ title: "VibeXR" });
{
  const s = content("VibeXR", "05 · Our approach", "Start from interaction that already feels right",
    "One file, one Enter button, one interaction model, and as many worlds as you like. The framework is the stable part; a project only writes its world.");
  const cw = (8.8 - 3 * 0.25) / 4;
  [["1", "file", "One HTML file on three.js. Paste it into CodePen or push it to a site: that's the build."],
   ["1", "Enter button", "AR with passthrough by default; headsets without AR quietly get VR. No \"VR only\"."],
   ["1", "interaction model", "Hands, controllers, gaze and mouse all point, pinch, poke and grab, near or far."],
   ["∞", "worlds", "A project supplies only its world. The framework brings the hands, UI and feel."]]
    .forEach(([big, title, body], i) => card(s, 0.6 + i * (cw + 0.25), 1.7, cw, 2.45, { big, title, body }));
  s.addText("The tuning comes from XR OS interaction design work: when the ray appears, how far a far grab travels, how big a poke volume is, how a hover outline reads on a messy model.",
    { x: 0.6, y: 4.35, w: 8.8, h: 0.6, fontSize: 13, italic: true, color: C.text2, margin: 0, isTextBox: true, objectName: "tuning" });
}

// 7 - one interaction model
{
  const s = content("VibeXR", "06 · How it works", "Four inputs, one interactor, the same events",
    "Every input becomes the same kind of interactor. Hover decides near or far: within reach you touch, beyond it the ray takes over. Objects get the same events whatever drove them.");
  [["Hand", "pinch · poke · grab"], ["Controller", "trigger · grip · stick"], ["Gaze", "Vision Pro pinch"], ["Mouse · keys", "desktop preview"]]
    .forEach(([t, sm], i) => node(s, 0.6, 1.65 + i * 0.82, 1.85, 0.66, t, sm));
  arrow(s, 2.55, 3.22, 3.05);
  node(s, 3.15, 2.72, 1.85, 1.0, "Interactor", "hover decides: near touch or far ray", true);
  arrow(s, 5.1, 3.22, 5.6);
  [["Interactables", "draggable · twoHand · precise · constrain · translateOnly · multi"],
   ["Events", "press · drag · tap · longpress · release · statechange"],
   ["UI kit", "Panels, buttons, sliders, labels, a palm-up hand menu, a sketch board, a log."]]
    .forEach(([title, body], i) => card(s, 5.7, 1.65 + i * 1.1, 3.7, 0.95, { title, body }));
}

// 8 - a world in a few lines
{
  const s = content("VibeXR", "07 · Build on it", "A world is a few lines",
    "This is a whole world: a cube you can grab near or far, scale with two hands, and tap. The tap fires the same way for a hand, a controller, a gaze pinch or a mouse.");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.6, w: 8.8, h: 3.4, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.accent3, width: 1 }, objectName: "code-box" });
  const k = (t) => ({ text: t, options: { color: C.accent1 } }), str = (t) => ({ text: t, options: { color: C.accent2 } }), cm = (t) => ({ text: t, options: { color: C.accent6 } }), p = (t) => ({ text: t, options: { color: C.accent5 } });
  const lines = [
    [k("const"), p(" Hello = {")],
    [p("  id: "), str("\"hello\""), p(",")],
    [p("  init(ctx) {")],
    [p("    "), k("const"), p(" { root, THREE } = ctx;")],
    [p("    root.add("), k("new"), p(" THREE.HemisphereLight(0xffffff, 0x222222, 2));")],
    [p("    "), k("const"), p(" cube = "), k("new"), p(" THREE.Mesh("), k("new"), p(" THREE.BoxGeometry(0.1, 0.1, 0.1),")],
    [p("                              "), k("new"), p(" THREE.MeshStandardMaterial());")],
    [p("    cube.position.set(0, 1.3, -0.5);  root.add(cube);")],
    [cm("    // grab near or far; two hands rotate and scale")],
    [p("    ctx.add(cube, { draggable: "), k("true"), p(", twoHand: "), k("true"), p(" })")],
    [cm("       // one event, whether a hand, a controller, a gaze pinch or a mouse did it")],
    [p("       .on("), str("\"tap\""), p(", () => ctx.log("), str("\"tapped\""), p("));")],
    [p("  },")],
    [p("};")],
    [p("app.worlds.register(Hello);")]
  ];
  const runs = [];
  lines.forEach((ln, i) => ln.forEach((r, j) => runs.push({ text: r.text, options: { ...r.options, breakLine: j === ln.length - 1 && i < lines.length - 1 } })));
  s.addText(runs, { x: 0.85, y: 1.75, w: 8.3, h: 3.1, fontFace: "Courier New", fontSize: 11, valign: "top", margin: 0, isTextBox: true, objectName: "code" });
}

// 9 - built on it
pres.addSection({ title: "Projects" });
{
  const s = content("Projects", "08 · Built on it", "Countless worlds, one framework",
    "Everything here runs in a headset browser from a link. Click any picture to open it.");
  const shots = [
    ["Resources/microduck/MicroduckXR.jpg", "Microduck XR", "a real robot policy on your floor", "https://rongxuanmu.com/microduck-xr/"],
    ["Resources/robot-zoo-xr/RobotZoo.jpg", "Robot Zoo XR", "humanoids and robot dogs", "https://rongxuanmu.com/robot-zoo-xr/"],
    ["Resources/roadster-xr/RoadsterNight.jpg", "Roadster Night", "a launch event as a diorama", "https://rongxuanmu.com/roadster-xr/"],
    ["Resources/archiscape/Archiscape.jpg", "Archiscape", "architecture through the ages", "https://rongxuanmu.com/archiscape/"],
    ["Resources/physics-cabinet/PhysicsCabinet.jpg", "Physics Cabinet", "ten experiments in your hands", "https://rongxuanmu.com/physics-cabinet/"],
    ["Resources/dream-cage/DreamCage.jpg", "Dream Cage", "a portal cube puzzle", "https://rongxuanmu.com/dream-cage/"],
    ["immersive-vibe/assets/social-preview.png", "Immersive Vibe", "paintings you step into", "https://rongxuanmu.com/immersive-vibe/"],
    ["Resources/vibexr-framework/VibeXRFramework.jpg", "Playground", "the framework itself", "https://rongxuanmu.com/vibexr/"]
  ];
  const cw = (8.8 - 3 * 0.2) / 4, ih = cw * 9 / 16;
  shots.forEach(([file, name, sub, url], i) => {
    const x = 0.6 + (i % 4) * (cw + 0.2), y = 1.55 + Math.floor(i / 4) * (ih + 0.62);
    s.addImage({ path: img(file), x, y, w: cw, h: ih, sizing: { type: "cover", w: cw, h: ih }, hyperlink: { url }, altText: name, objectName: id("shot") });
    s.addText([{ text: name, options: { bold: true, color: C.text1, fontSize: 12, breakLine: true } }, { text: sub, options: { color: C.text2, fontSize: 10 } }],
      { x, y: y + ih + 0.05, w: cw, h: 0.5, valign: "top", margin: 0, isTextBox: true, objectName: id("shot-caption") });
  });
}

// 10 - principles
{
  const s = content("Projects", "09 · What we learned", "Rules that keep it working everywhere",
    "Four rules that came out of building these: passthrough first, diorama scale, the console rides along, and light enough for glasses.");
  const cw = (8.8 - 0.3) / 2, ch = 1.45;
  [["Passthrough first", "Things live in your room: a stage on the real floor or a desk at your height, measured from your head."],
   ["Diorama scale", "Big worlds become tabletop or floor miniatures you can walk around, and they can run faster so they don't read as slow motion."],
   ["The console rides along", "Panels follow the stage they control, and each can be dragged by its own bar."],
   ["Light enough for glasses", "Generated geometry, no heavy assets, so standalone headsets and puck-tethered see-through glasses keep up."]]
    .forEach(([title, body], i) => card(s, 0.6 + (i % 2) * (cw + 0.3), 1.65 + Math.floor(i / 2) * (ch + 0.25), cw, ch, { title, body }));
}

// 11 - workflow
pres.addSection({ title: "Close" });
{
  const s = content("Close", "10 · Workflow", "How these were made",
    "Voice notes from inside the headset go to an AI coding agent, which edits only the world. Every change is checked headless, tried on the dev page, then released.");
  const nw = 1.52, gap = 0.3;
  [["Voice note", "in the headset"], ["AI agent", "edits the world"], ["Headless tests", "screenshots · checks"], ["/dev page", "try in a headset"], ["Release", "site + CodePen"]].forEach(([t, sm], i) => {
    const x = 0.6 + i * (nw + gap);
    node(s, x, 1.7, nw, 0.85, t, sm, i === 4);
    if (i < 4) arrow(s, x + nw + 0.04, 2.125, x + nw + gap - 0.04);
  });
  bullets(s, 0.6, 2.95, 8.8, 2.0, [
    ["The framework is the stable part:", "the agent only writes the world, so interaction quality never regresses."],
    ["Rules live in the repo:", "\"one Enter button, passthrough first\" is written down once and followed every time."],
    ["Every change is shown before it ships:", "screenshots, measured trajectories, a test page."]
  ], 14);
}

// 12 - try it
{
  const s = content("Close", "Demo · thank you", "Put on a headset and open a link",
    "Live demo: the playground first, then Microduck and Roadster Night. The video on this slide is Microduck XR in a headset, as a fallback if the live demo can't run. Questions.");
  s.addText("Any WebXR browser: Quest, PICO, Vision Pro, Galaxy XR. On a laptop, everything runs as a desktop preview.",
    { x: 0.6, y: 1.6, w: 8.8, h: 0.6, fontSize: 16, color: C.text2, margin: 0, isTextBox: true, objectName: "lead" });
  const links = [["Interaction Playground", "https://rongxuanmu.com/vibexr/"], ["Microduck XR", "https://rongxuanmu.com/microduck-xr/"], ["Roadster Night", "https://rongxuanmu.com/roadster-xr/"], ["Framework page", "https://rongxuanmu.com/Works/VibeXRFramework.html"]];
  const lw = (8.8 - 3 * 0.2) / 4;
  links.forEach(([t, url], i) => {
    const x = 0.6 + i * (lw + 0.2);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.5, w: lw, h: 0.55, rectRadius: 0.27, fill: { color: C.background2 }, line: { color: C.accent3, width: 1 }, objectName: id("pill") });
    s.addText(`${t} ↗`, { x, y: 2.5, w: lw, h: 0.55, fontSize: 13, bold: true, color: C.text1, align: "center", valign: "middle", margin: 0, hyperlink: { url }, isTextBox: true, objectName: id("pill-text") });
  });
  s.addMedia({ type: "video", path: img("Resources/microduck/MicroduckXR.mp4"), cover: poster("Resources/microduck/MicroduckXR.jpg"), x: 5.4, y: 3.25, w: 4.0, h: 4.0 * 9 / 16 * 0.9, objectName: "closing-video" });
  s.addText([{ text: "Rongxuan Mu", options: { bold: true, color: C.text1, breakLine: true } }, { text: "rongxuanmu.com", options: { color: C.accent1, hyperlink: { url: "https://rongxuanmu.com" } } }],
    { x: 0.6, y: 3.45, w: 4.6, h: 0.8, fontSize: 20, valign: "top", margin: 0, isTextBox: true, objectName: "contact" });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
