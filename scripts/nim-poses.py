#!/usr/bin/env python3
"""Draws Nim, the mascot, in her four poses: docs/mascot/nim-{wave,think,cheer,doze}.svg.
Every pose is the same head-and-shoulders on a brand-yellow disc (so she holds up on dark backgrounds);
only the eyes, the mouth, one hand and the lightbulb change. Run: python3 scripts/nim-poses.py"""
from pathlib import Path

INK, HAIR, SKIN, JACKET, LAPEL, YELLOW, DEEP, LIPS = "#1f1b16", "#1a1412", "#f3d3b3", "#2b2622", "#3a332d", "#ffca30", "#8a6412", "#7a1f3d"

HAIR_BACK = f'<path d="M60 108 A 60 60 0 0 1 180 108 L 184 240 L 56 240 Z" fill="{HAIR}"/>'
BODY = f'''<path d="M40 240 C 40 194, 76 186, 120 186 C 164 186, 200 194, 200 240 Z" fill="{INK}"/>
  <rect x="104" y="140" width="32" height="40" rx="16" fill="{SKIN}"/>
  <path d="M30 240 C 30 200, 62 186, 98 184 L 112 240 Z" fill="{JACKET}"/>
  <path d="M210 240 C 210 200, 178 186, 142 184 L 128 240 Z" fill="{JACKET}"/>
  <path d="M98 184 L 114 214 L 104 224 L 88 196 Z" fill="{LAPEL}"/>
  <path d="M142 184 L 126 214 L 136 224 L 152 196 Z" fill="{LAPEL}"/>
  <path d="M120 218 L 120 240" stroke="{LAPEL}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="92" cy="206" r="2.5" fill="{YELLOW}"/>
  <path d="M104 160 Q 120 166 136 160" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="120" cy="167" r="2.5" fill="{YELLOW}"/>'''
FACE = f'''<circle cx="120" cy="108" r="52" fill="{SKIN}"/>
  <path d="M60 108 C 56 132, 60 152, 74 164 C 68 144, 72 124, 86 108 Z" fill="{HAIR}"/>
  <path d="M180 108 C 184 132, 180 152, 166 164 C 172 144, 168 124, 154 108 Z" fill="{HAIR}"/>
  <circle cx="64" cy="140" r="16" fill="none" stroke="{YELLOW}" stroke-width="4"/>
  <circle cx="176" cy="140" r="16" fill="none" stroke="{YELLOW}" stroke-width="4"/>
  <path d="M120 48 C 88 50, 62 74, 60 108 L 86 108 C 90 86, 104 66, 120 48 Z" fill="{HAIR}"/>
  <path d="M120 48 C 152 50, 178 74, 180 108 L 154 108 C 150 86, 136 66, 120 48 Z" fill="{HAIR}"/>
  <circle cx="94" cy="128" r="8" fill="#e07a3f" opacity="0.28"/>
  <circle cx="146" cy="128" r="8" fill="#e07a3f" opacity="0.28"/>
  <path d="M88 100 Q 101 95 114 99" fill="none" stroke="{HAIR}" stroke-width="3" stroke-linecap="round"/>
  <path d="M126 99 Q 139 95 152 100" fill="none" stroke="{HAIR}" stroke-width="3" stroke-linecap="round"/>'''

def open_eyes(dx=0, dy=0, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'''<g{c}><path d="M84 116 Q 101 108 118 116 Q 101 124 84 116 Z" fill="#fff"/>
  <path d="M122 116 Q 139 108 156 116 Q 139 124 122 116 Z" fill="#fff"/>
  <circle cx="{102+dx}" cy="{115+dy}" r="6.5" fill="#2a1a12"/>
  <circle cx="{138+dx}" cy="{115+dy}" r="6.5" fill="#2a1a12"/>
  <circle cx="{105+dx}" cy="{112+dy}" r="2.4" fill="#fff"/>
  <circle cx="{141+dx}" cy="{112+dy}" r="2.4" fill="#fff"/>
  <path d="M78 112 L 84 116 Q 101 108 118 116" fill="none" stroke="{HAIR}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M122 116 Q 139 108 156 116 L 162 112" fill="none" stroke="{HAIR}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>'''

# Happy closed eyes curve up; sleeping ones curve down. Both keep the winged liner.
HAPPY = f'''<path d="M78 116 L 86 118 Q 101 106 116 118" fill="none" stroke="{HAIR}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M124 118 Q 139 106 154 118 L 162 116" fill="none" stroke="{HAIR}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'''
ASLEEP = f'''<path d="M78 112 L 86 116 Q 101 124 116 116" fill="none" stroke="{HAIR}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M124 116 Q 139 124 154 116 L 162 112" fill="none" stroke="{HAIR}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'''

SMIRK = f'<path d="M108 141 Q 122 136 134 140 Q 124 150 108 141 Z" fill="{LIPS}"/>'
SMILE = f'<path d="M106 138 Q 120 136 134 138 Q 120 154 106 138 Z" fill="{LIPS}"/>'
PURSE = f'<ellipse cx="124" cy="142" rx="5" ry="4" fill="{LIPS}"/>'
REST = f'<path d="M112 142 Q 120 146 128 142" fill="none" stroke="{LIPS}" stroke-width="3.5" stroke-linecap="round"/>'

def bulb(x, y, lit):
    """The Nimble lightbulb: cream glass with a deep outline; lit adds three short rays."""
    rays = "".join(
        f'<path d="M{x+ax} {y+ay} L {x+bx} {y+by}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
        for ax, ay, bx, by in [(-22, -10, -30, -14), (0, -24, 0, -33), (22, -10, 30, -14)]) if lit else ""
    glass = "#fff" if lit else "#fff6d6"
    return f'''{rays}<circle cx="{x}" cy="{y}" r="15" fill="{glass}" stroke="{DEEP}" stroke-width="3"/>
  <rect x="{x-7}" y="{y+13}" width="14" height="9" rx="3" fill="{DEEP}"/>'''

def arm(x0, y0, x1, y1):
    """A jacket sleeve from the bottom edge to the hand, then the hand."""
    return f'''<path d="M{x0} {y0} L {x1} {y1}" stroke="{JACKET}" stroke-width="26" stroke-linecap="round"/>
  <circle cx="{x1}" cy="{y1}" r="13" fill="{SKIN}"/>'''

POSES = {
    # Hello: the empty screen.
    "wave": dict(eyes=open_eyes(), mouth=SMILE, extra=arm(196, 240, 198, 150) +
                 f'<path d="M190 138 L 188 128 M198 136 L 198 125 M206 138 L 208 128" stroke="{SKIN}" stroke-width="6" stroke-linecap="round"/>'),
    # Thinking: the loading card. Eyes up and aside, an unlit bulb over her head.
    "think": dict(eyes=open_eyes(-2, -2, "nim-eye"), mouth=PURSE, extra=arm(70, 240, 104, 168) + bulb(188, 50, False)),
    # Got it: the bulb lit and raised.
    "cheer": dict(eyes=HAPPY, mouth=SMILE, extra=arm(196, 240, 194, 104) + bulb(194, 70, True)),
    # Resting: the free AI is out for the day. Head tilted, eyes shut.
    "doze": dict(eyes=ASLEEP, mouth=REST, extra="", tilt=-8),
}

def svg(pose, p):
    tilt = p.get("tilt", 0)
    head = f'<g transform="rotate({tilt} 120 150)">' if tilt else "<g>"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="Nim, Nimble's mascot">
  <!-- Generated by scripts/nim-poses.py ({pose}). Edit the script, not this file. -->
  <defs><clipPath id="nim-disc-{pose}"><circle cx="120" cy="120" r="120"/></clipPath></defs>
  <circle cx="120" cy="120" r="120" fill="{YELLOW}"/>
  <g clip-path="url(#nim-disc-{pose})">
  {head}{HAIR_BACK}</g>
  {BODY}
  {head}{FACE}
  {p["eyes"]}
  {p["mouth"]}</g>
  {p["extra"]}
  </g>
</svg>
'''

out = Path(__file__).resolve().parent.parent / "docs" / "mascot"
for name, p in POSES.items():
    (out / f"nim-{name}.svg").write_text(svg(name, p))

# The same drawings for the Kotlin apps, which draw them with NimMark.kt (no SVG support on Android).
kt = out.parent.parent / "kmp" / "composeApp" / "src" / "commonMain" / "kotlin" / "com" / "nulljosh" / "nimble" / "NimArt.kt"
body = "".join(f'    "{n}" to """{(out / f"nim-{n}.svg").read_text()}""",\n' for n in POSES)
kt.write_text("package com.nulljosh.nimble\n\n// Generated by scripts/nim-poses.py. Edit the script, not this file.\ninternal val NIM_ART: Map<String, String> = mapOf(\n" + body + ")\n")
print("wrote", ", ".join(f"nim-{n}.svg" for n in POSES), "and NimArt.kt")
