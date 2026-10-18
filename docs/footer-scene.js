// The landing footer's engraved scene, one fragment shader: the Nimble bulb switched on over karst towers and a river
// that mirrors them, like the Li River at Guilin. Every tone is drawn as ink lines, so it reads as an etching in the
// page's gold rather than a gradient. Same technique as Atlin's footer harbour. Colours come from the CSS custom
// properties --scene-paper and --scene-ink on the canvas, so light and dark follow the page.
(function () {
  var canvas = document.getElementById("foot-scene");
  var gl = canvas && canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) { if (canvas) canvas.style.display = "none"; return; }

  var FRAG = [
    "precision highp float;",
    "uniform vec2 res; uniform float time; uniform vec3 paper; uniform vec3 ink; uniform float dpr;",
    "float hash(float n) { return fract(sin(n) * 43758.5453); }",
    "float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise2(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);",
    "}",
    // Ink lines at angle a, spacing s pixels. 1 where ink falls for tone t.
    "float hatch(vec2 px, float a, float s, float t) {",
    "  float d = abs(fract(dot(px, vec2(cos(a), sin(a))) / s) - 0.5) * 2.0;",
    "  return 1.0 - smoothstep(t - 0.12, t + 0.12, d);",
    "}",
    // Concentric rings around a point: the glow of the bulb.
    "float rings(vec2 px, vec2 c, float s, float t) {",
    "  float d = abs(fract(length(px - c) / s) - 0.5) * 2.0;",
    "  return 1.0 - smoothstep(t - 0.12, t + 0.12, d);",
    "}",
    // Karst towers: steep rounded domes of hashed height, one per cell, in units of the plate's height.
    "float towers(float x, float cells, float seed, float h0, float h1, float w0, float w1) {",
    "  float best = 0.0, cell = floor(x * cells);",
    "  for (int i = -1; i <= 1; i++) {",
    "    float id = cell + float(i);",
    "    float cx = (id + 0.2 + 0.6 * hash(id * 3.1 + seed)) / cells;",
    "    float h = mix(h0, h1, hash(id * 7.7 + seed));",
    "    float w = mix(w0, w1, hash(id * 5.3 + seed));",
    "    float t = (x - cx) / w;",
    "    best = max(best, h * sqrt(max(0.0, 1.0 - t * t)));",
    "  }",
    "  return best;",
    "}",
    "float boxd(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }",
    "const float WATER = 0.28;",
    "const vec2 BULB = vec2(0.5, 0.70);",
    // Tone of the scene above the water, 0 = paper, 1 = solid ink. kind picks the hatch.
    "float scene(vec2 uv, out float kind) {",
    "  float asp = res.x / res.y;",
    "  float x = uv.x * asp;",
    "  vec2 px = uv * res;",
    "  float up = uv.y - WATER;",
    "  float near = towers(x + 0.9, 3.0, 1.0, 0.14, 0.26, 0.10, 0.17);",
    "  float far = towers(x + 0.2, 2.2, 7.0, 0.24, 0.40, 0.13, 0.24);",
    "  kind = 0.0;",
    "  if (up < near) { kind = 1.0; return clamp(0.34 + (near - up) * 1.3, 0.22, 0.74); }",
    // The bulb stands in front of the far towers: a glass disc, a tapering neck and a threaded screw base, with a filament inside.
    "  float R = 0.10 * res.y;",
    "  vec2 c = vec2(BULB.x * res.x, BULB.y * res.y);",
    "  float dark = step(dot(paper, vec3(0.333)), 0.5);",
    "  float glass = length(px - c) - R;",
    "  float dy = (c.y - 0.55 * R) - px.y;",
    "  float halfw = mix(0.78 * R, 0.46 * R, clamp(dy / (1.5 * R), 0.0, 1.0));",
    "  float neck = max(abs(px.x - c.x) - halfw, max(-dy, dy - 1.5 * R));",
    "  float body = min(glass, neck);",
    "  float bdy = (c.y - 0.55 * R) - px.y - 1.5 * R;",
    "  float base = max(abs(px.x - c.x) - 0.46 * R, max(-bdy, bdy - 0.62 * R));",
    "  vec2 fp = px - c;",
    "  float arch = abs(length(fp - vec2(0.0, -0.05 * R)) - 0.24 * R);",
    "  float post = abs(abs(fp.x) - 0.24 * R);",
    "  bool filament = (arch < 1.3 * dpr && fp.y > -0.05 * R) || (post < 1.3 * dpr && fp.y < -0.05 * R && fp.y > -0.9 * R);",
    "  if (base < 0.0) { kind = 7.0; return 0.78; }",
    "  if (abs(base) < 1.3 * dpr) { kind = 6.0; return 1.0; }",
    "  if (body < 0.0 && filament) { kind = 6.0; return 1.0; }",
    "  if (abs(body) < 1.6 * dpr && body > -1.6 * dpr) { kind = 6.0; return 1.0; }",
    // Lit glass: bare paper by day, inked (so it glows) at night.
    "  if (body < 0.0) { kind = dark > 0.5 ? 8.0 : 0.0; return dark > 0.5 ? 0.86 : 0.0; }",
    "  if (up < far) { kind = 3.0; return clamp(0.18 + (far - up) * 0.8, 0.08, 0.46); }",
    // Glow rings around the bulb, fading out.
    "  float d = length(px - c);",
    "  kind = 5.0;",
    "  return (1.0 - smoothstep(R, R * 3.6, d)) * 0.74;",
    "}",
    "void main() {",
    "  vec2 px = gl_FragCoord.xy;",
    "  vec2 uv = px / res;",
    "  float kind, tone;",
    "  if (uv.y < WATER) {",
    // The river mirrors the towers and the bulb, broken up by slow ripples.
    "    float ripple = sin(uv.y * 240.0) * 0.004 + (noise2(vec2(uv.x * 40.0, uv.y * 90.0)) - 0.5) * 0.012;",
    "    vec2 m = vec2(uv.x + ripple, WATER + (WATER - uv.y) * 0.95);",
    "    float depth = uv.y / WATER;",
    "    float k; tone = scene(m, k) * 0.5 * depth + 0.05; kind = 4.0;",
    "  } else {",
    "    tone = scene(uv, kind);",
    "  }",
    "  float s = (kind == 7.0 ? 2.6 : kind == 8.0 ? 2.0 : 4.0) * dpr;",
    "  float a = kind == 1.0 ? 0.785 : kind == 3.0 ? -0.6 : (kind == 4.0 || kind == 7.0) ? 1.5708 : kind == 6.0 ? 0.0 : kind == 8.0 ? 1.5708 : 0.35;",
    "  float lines = kind == 5.0 ? 0.0 : hatch(px, a, s, tone);",
    "  if (kind == 5.0) lines = rings(px, vec2(0.5 * res.x, 0.70 * res.y), s * 1.15, tone);",
    "  if (kind == 1.0 || kind == 6.0) lines = max(lines, hatch(px, a + 1.5708, s, tone - 0.42));",
    // The plate fades in from the top so it sits quietly under the footer text.
    "  float fade = smoothstep(1.0, 0.72, uv.y);",
    "  float grain = (hash2(px) - 0.5) * 0.06;",
    "  float amt = clamp(lines * fade + grain * fade, 0.0, 1.0);",
    "  gl_FragColor = vec4(mix(paper, ink, amt), 1.0);",
    "}"
  ].join("\n");
  var VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

  function rgb(css) {
    var c = document.createElement("canvas").getContext("2d");
    c.fillStyle = css;
    var h = c.fillStyle;
    if (h.charAt(0) === "#") return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    return (h.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(function (n) { return +n / 255; });
  }

  var prog = gl.createProgram();
  [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (pair) {
    var sh = gl.createShader(pair[0]);
    gl.shaderSource(sh, pair[1]);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
  });
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = "none"; return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var u = function (n) { return gl.getUniformLocation(prog, n); };

  // One still frame is the whole scene: no motion, so reduced motion needs no special case, and it draws only on resize or a theme change.
  function draw() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    var css = getComputedStyle(canvas);
    gl.uniform2f(u("res"), w, h);
    gl.uniform1f(u("time"), 0);
    gl.uniform1f(u("dpr"), dpr);
    gl.uniform3fv(u("paper"), rgb(css.getPropertyValue("--scene-paper").trim() || "#f5f0e4"));
    gl.uniform3fv(u("ink"), rgb(css.getPropertyValue("--scene-ink").trim() || "#8a6412"));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  draw();
  window.addEventListener("resize", draw);
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", draw);
})();
