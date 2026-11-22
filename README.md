# Kindlings Home Twin

A small, original, top-down adventure game where a lion cub and a panda help two children through their day: brushing teeth, getting dressed, tidying up, learning games and bedtime. It is also a "digital twin": a simulation used to test product ideas for a gentle AI pet companion before any hardware is built.

**Play:** open the GitHub Pages link for this repository on a phone, tablet or laptop. On a phone, use "Add to Home Screen" to install it; after the first visit it works fully offline.

## What is in here

- `simulator.html`: the game (Watch, Play and Parent modes, situations, body comparison).
- `pet-art.js`: the pets' vector art and pixel sprites.
- `challenges.js`: the learning encounters and puzzle critters.
- `lines.js` and `voice.js`: the dialogue and the voice player.
- `audio/`: pre-recorded voice clips made with the open-weight Kokoro text-to-speech model.
- `sw.js` and `manifest.webmanifest`: offline support and installation.

## Privacy

- The game makes no network requests after it loads. There are no analytics, ads, accounts or tracking.
- Children's and pets' names are typed in on the device (Parent, then Names) and stay in that browser's local storage. The defaults are placeholders.
- Saved progress lives only in the browser on the device. Clearing site data removes it.

## Design rules it follows

No streaks, no loss or guilt mechanics, no timers or buzzers on mistakes, no currencies, no loot boxes and no notifications. Habits never earn screen time. Praise is for effort and method. The pets go to sleep at bedtime.

This repository is a built copy. Source and design documents are kept privately.
