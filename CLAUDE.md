# Notes for Claude

## VibeXR Interaction Framework rules (from Rongxuan, repeated across many sessions)

- **No "VR only" mode, ever.** A VibeXR page has exactly one **Enter** button. It starts `immersive-ar` with VST
  (passthrough) on by default. Where a headset has no AR session, the same button quietly enters `immersive-vr`;
  never add a second button, a "VR only" label, or any other user-facing VR choice. On optical see-through (OST)
  headsets "VR only" doesn't even make sense.
- This applies to the framework (`vibexr/codepen.html`) and every project built on it: Microduck XR, the Immersive
  Vibe gallery, and anything new.

## Where things live

- The framework source is `vibexr/codepen.html`, in CodePen paste format with CRLF line endings; keep them CRLF.
  Run `python3 vibexr/build.py` after editing. `vibexr/README.md` covers the dev page, promotion and CodePen sync.
- Pushing to `main` deploys the site to GitHub Pages. Rongxuan tests in a headset at `/vibexr/dev/` first.

## Voice input

Rongxuan often dictates by voice, and the transcription sometimes turns "Micro Duck" (Microduck XR) into "Micro" or
"Microsoft". Judge from context: about these projects' interaction, stage or robots it is usually Microduck; about
HoloLens, MRTK, Windows or the company it may really be Microsoft. When it could be either, ask.
