# Brag Plan: APY (Attendance Ledger & Bunk Forecaster)

## What is this app?
APY is a collegiate attendance tracker that lets students instantly see how many classes they can safely bunk while staying above the 75% attendance threshold.

## The angle
Playful college‑startup vibe: turn the anxiety of attendance tracking into a quick‑game‑style “how many you can miss?” moment. The video will feel like a tiny product‑launch pitch you might see at a campus hackathon.

## Hook (first 2‑3 seconds)
A stressed student stares at a red “Attendance < 75%!” warning, then the screen explodes with a bright green “Safe to bunk 3 periods!” badge and a playful “BUNK? YES!” pop‑up.

## Key moments (the middle)
- **Baseline onboarding** – quick entry of current attendance numbers (e.g., `193 / 262`) and instant safe‑bunk calculation.
- **Forecast tool** – a 7‑day timeline slider where the student toggles “Take Friday off?” and sees the attendance curve shift.
- **Admin PIN reset** – admin view pops a gold‑accented “PIN RESET” dialog, showcasing the secure admin panel.

## Outro / punchline
The APY crest glides to the center, the tagline appears: “Never miss a lecture. Never miss a bunk.” The music drops out on the final beat.

## User flow worth showing
1. Launch app →
2. Enter baseline attendance →
3. View safe‑bunk count →
4. Adjust forecast →
5. See updated safe‑bunk number.

## Tone
- Preset: `default` (playful, clean, postable)
- Creative direction: “college‑hackathon launch, upbeat indie vibe.”
- Interpretation: fast‑paced cuts, bright greens, light‑hearted copy, minimal deadpan.

## Format: landscape — 1920×1080
## Duration: 20 seconds (target 18‑22 s)

## Visual identity (from the project)
- Background: `var(--bg)` – #F6F7F2 (light parchment)
- Accent: `var(--accent-gold)` – #BC8D4B
- Primary brand: `var(--brand-forest)` – #174C45
- Text: `var(--ink)` – #172722
- Display font (headlines): `Fraunces` (var(--font-serif))
- Body font: `Inter` (var(--font-sans))
- Strongest visual element: the green “Safe to bunk X periods!” badge from `frontend/src/App.jsx`.

## Share copy (draft)
"APY turns attendance tracking into a guilt‑free game – see how many classes you can safely miss while staying above 75% ! #CollegeLife #AttendanceApp"

## Audio direction
- Role: upbeat indie backdrop that supports the hook and highlights without overpowering UI sounds.
- Music: placeholder track `upbeat‑indie.mp3` (bpm ≈ 110). Starts on the hook beat, fades out in the outro.
- Music treatment: fade‑in 0.3 s at start, maintain steady volume, slight dip during the forecast toggle, final 0.5 s fade‑out.
- Music cue guidance: cue at 0.0 s (hook), 4.5 s (baseline entry), 9.0 s (forecast toggle), 15.0 s (admin PIN reset), 19.0 s (outro logo).
- Audio‑reactive treatment: subtle pulsing of the green badge on the beat; UI click SFX on button taps.
- SFX posture: moderate – clicks on taps, a soft “ding” on safe‑bunk reveal, a crisp “whoosh” on the logo transition.
- Audio‑coupled ideas: typing animation of baseline numbers (key‑tick sounds), slider movement syncs to a light hi‑hat.
- Restraint rule: No loud bass drops; keep the overall energy light and campus‑friendly.

## Storyboard

### Scene 1 — Hook — 2.5 s
- Screen: Student’s phone shows a red warning “Attendance < 75%!”.
- Text: “Whoa!” flashes, then a bright green badge pops: **“Safe to bunk 3 periods!”**.
- Sequential/interaction: badge scales up, then a playful “BUNK? YES!” button appears.
- Audio intent: quick percussive hit on badge pop, light key‑tick on button.
- Audio‑coupled idea: badge pop syncs with a synth stab.
- Music: starts at the badge pop, upbeat rhythm.
- Transition mood: hard cut → Scene 2.

### Scene 2 – Baseline onboarding – 4.0 s
- Screen: APY home screen, baseline entry fields appear.
- Text: “Enter your current attendance” (type‑out effect).
- Interaction: numbers `193 / 262` type in with key‑tick SFX.
- Audio intent: typing clicks, subtle rising chord as numbers settle.
- Audio‑coupled idea: each digit typed on a beat.
- Music: continues, low‑mid groove.
- Transition mood: slide left → Scene 3.

### Scene 3 – Safe‑bunk highlight – 3.5 s
- Screen: calculation result shows large green **“3”** with “Safe to bunk 3 periods!” label.
- Interaction: user taps a bright “BUNK?” button, button flashes.
- Audio intent: click SFX, brief “ding” on green number.
- Audio‑coupled idea: green number pulses on beat.
- Music: accent on the tap beat.
- Transition mood: quick zoom out → Scene 4.

### Scene 4 – Forecast tool – 4.0 s
- Screen: 7‑day timeline chart with a slider.
- Interaction: user drags “Take Friday off?” toggle; chart line dips then rises.
- Text: “What if I skip Friday?” appears briefly.
- Audio intent: slider swoosh SFX, soft chord change as forecast updates.
- Audio‑coupled idea: chart line pulses on each day change synced to hi‑hat.
- Music: continues, slight variation at the toggle.
- Transition mood: soft crossfade → Scene 5.

### Scene 5 – Admin PIN reset – 3.5 s
- Screen: admin panel with gold‑accented “PIN RESET” dialog.
- Interaction: admin types a 4‑digit PIN, gold glow flares.
- Audio intent: typing clicks, a soft “whoosh” on glow.
- Audio‑coupled idea: gold glow syncs with a subtle synth rise.
- Music: stays steady, small lift at the glow.
- Transition mood: hard cut → Scene 6.

### Scene 6 – Outro / punchline – 2.5 s
- Visual: APY crest (green gradient) slides to center, logo settles.
- Text: “Never miss a lecture. Never miss a bunk.” fades in.
- Audio intent: final chord, logo swoosh.
- Audio‑coupled idea: logo pulse on the final beat.
- Music: fades out over 0.5 s, ending on a clean chord.
- Transition mood: none (end).

**Music mood for this video:** upbeat indie pop with bright synths and light percussion.
**Audio summary:** fast‑paced beats drive the hook and UI clicks, while a steady indie backdrop ties the flow together without overpowering the product visuals.
