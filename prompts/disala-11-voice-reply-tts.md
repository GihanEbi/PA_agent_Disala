# Disala — Spoken replies for voice-originated messages (OpenAI text-to-speech)

## Goal

When a message is sent by voice (via `disala-10`'s recorder), Disala's reply should also be **spoken back**, not just shown as text. The text transcript stays exactly as it is today — this adds audio on top of it, only for the voice-in path. A typed message still gets a text-only reply, unchanged. Per your choice, speech is generated via **OpenAI's text-to-speech** (same `OPENAI_API_KEY` already used for chat and, since `disala-10`, transcription), not the browser's native `speechSynthesis`.

## Relevant skills

None packaged — `@ai-sdk/openai`'s `speech()` provider and `ai`'s `generateSpeech()` were confirmed directly against the installed package types (`node_modules/@ai-sdk/openai/dist/index.d.ts:1411,1500`, `node_modules/ai/dist/index.d.ts:8146-8220`), the same discipline `disala-10` applied to the transcription API.

## Existing code inspected

- `components/disala/voice-sheet.tsx` (full file, current state after `disala-10` and the follow-up mode-persistence fix) — `handleSend(message)` posts to `/api/chat`, appends the assistant's reply to `messages`, and is called from two places: `handleTranscribed` (voice input, after a successful non-empty transcript) and directly as `ChatComposer`'s `onSend` (typed input). This is the one seam where "did this message originate from voice" is known and must be threaded through, since `/api/chat` itself has no concept of it and shouldn't need one (see decision #1).
- `node_modules/ai/dist/index.d.ts:8146-8220` — confirmed `generateSpeech({ model, text, voice?, outputFormat?, ... })` returns `SpeechResult` with `.audio: GeneratedAudioFile`; `GeneratedAudioFile` (`index.d.ts:1013-1032`) exposes `.uint8Array`, `.base64`, `.mediaType`. Not a streaming API — the full clip is generated before the call resolves.
- `node_modules/@ai-sdk/openai/dist/index.d.ts:1411,1500` — confirmed `openai.speech(modelId)`, `OpenAISpeechModelId` includes `'tts-1'`, `'tts-1-hd'`, `'gpt-4o-mini-tts'`, and dated variants.
- `app/api/transcribe/route.ts` (from `disala-10`, full file) — the direct precedent for this phase's new route: `auth()` gate → 401, validate input, call the `ai`/`@ai-sdk/openai` function, map failure to an honest JSON error with a non-200 status, never throw past the boundary.
- `components/disala/voice-state-chip.tsx` — the existing `{ label, onClose? }` pill, already reused three times (`disala-10`'s "Listening…"/"Transcribing…", the base "Disala is thinking…"). Its optional `onClose` is exactly the shape needed for a "stop speaking" control — no new chip component needed.
- Browser autoplay policy (not a repo file, but load-bearing): most browsers allow `HTMLAudioElement.play()` to proceed without a fresh user gesture when it's called from a promise chain that started with one (here, the chain starts with the user tapping the mic button), but some browsers/situations still reject it (`NotAllowedError`), especially iOS Safari after any delay. The design must not assume autoplay always succeeds.

## Architectural decisions

1. **`handleSend` gains an internal `speak: boolean` flag, not a change to `/api/chat`.** `handleTranscribed` calls `handleSend(trimmed, { speak: true })`; `ChatComposer`'s `onSend={handleSend}` (typed path) calls it with no second argument, so it defaults to `false`. The chat route itself stays exactly as `disala-07` left it — it has no idea whether the model's audience wants audio, and shouldn't: whether to *play* a reply is a client-side presentation choice about a reply that already exists, not a change to what the agent computes or returns.
2. **New route `app/api/speak/route.ts`.** `POST`, gated by `auth()` exactly like `/api/chat`/`/api/transcribe` (401 if signed out — prevents unauthenticated use of a billable OpenAI endpoint). Body `{ text: string }`, Zod-validated with the same `.max(4000)` cap `/api/chat`'s own request schema already uses for symmetry. Calls `generateSpeech({ model: openai.speech(TTS_MODEL_ID), text, voice: TTS_VOICE, outputFormat: "mp3" })` and returns the **raw audio bytes** with `Content-Type: audio/mpeg` — not JSON/base64, so the client can hand the response body straight to `Blob`/`Audio` without an extra decode step.
3. **`TTS_MODEL_ID = "tts-1"` and `TTS_VOICE = "alloy"`, both named constants**, mirroring `disala-10` decision #4's treatment of `whisper-1`: `tts-1` is OpenAI's long-established baseline (vs. the pricier `tts-1-hd` or the newer `gpt-4o-mini-tts`), and `alloy` is one of OpenAI's standard voice names. Both are one-line changes later; nothing else in this design depends on which model or voice is picked.
4. **The client fetches `/api/speak` once, per voice-originated reply, only after that reply's text has already rendered.** Sequence: `handleSend` completes its existing `/api/chat` round trip and appends the assistant bubble (unchanged) → *then*, only if `speak` was `true` for that call, it fetches `/api/speak` with the reply text, gets back an audio `Blob`, and plays it. The text is never delayed waiting on audio — you see the answer immediately and hear it a moment later, rather than the whole reply appearing to hang until speech synthesis finishes.
5. **Autoplay is attempted immediately; a blocked attempt degrades to a visible, tappable "Play reply" control, never a silent failure.** `audio.play()`'s returned promise is awaited; if it rejects, the fetched audio is kept in state and a small button (existing `Button`/`Icon` primitives, a speaker icon) appears so the user can start it with an explicit tap — which is guaranteed to satisfy any browser's autoplay gate. Nothing about the *text* reply is affected either way.
6. **Barge-in: tapping "Start talking" while Disala is speaking stops the playback and immediately starts recording**, the standard voice-assistant interruption pattern. Implemented by having the mic click handler stop/clear any active `Audio` element before calling `recorder.start()`. Without this, a user who wants to interrupt a long spoken reply would have no way to do it short of closing the sheet.
7. **A `VoiceStateChip label="Speaking…" onClose={stopSpeaking}` replaces the suggestion/transcript area while audio is playing**, reusing the exact chip pattern `disala-10` established for "Listening…"/"Transcribing…" — `onClose` gives an explicit stop control beyond just barge-in-via-mic, for someone who wants to stop the audio without immediately starting a new recording.
8. **A text-to-speech failure is silent to the extent that it never blocks or overwrites the already-successful text reply, but is not swallowed outright** — the fetch failing (network error, `/api/speak` returning non-200) simply results in no audio and no visible error chip, since the actual answer already rendered correctly and a TTS-specific failure banner would overstate the severity of what went wrong. The failure is still `console.error`-logged server- and client-side for debugging, matching the "log, don't crash, don't fabricate success" discipline the rest of this codebase already follows — the difference here is that failing to *speak* a reply that already displayed correctly isn't a user-facing error in the way a failed chat call is.
9. **Every code path that ends narration — a new recording starting, the reply finishing naturally, `stopSpeaking`, or the sheet closing — pauses the `Audio` element and revokes its object URL.** Mirrors `disala-10`'s discipline of releasing the microphone on every exit path, applied to the analogous resource (an `ObjectURL` held in memory) on the output side.

## Assumptions

- **Only voice-originated replies are spoken.** A typed message never gets an audio reply, matching your stated scope exactly ("if I select voice... it should reply with voice as well" — implying typed stays text-only). If you'd actually like typed replies spoken too, that's a one-line change to `ChatComposer`'s `onSend` wiring, not a redesign.
- **No streaming audio.** `generateSpeech` returns one complete clip; for the length of a typical Disala reply (a sentence or two per the plain-language system-prompt rule from earlier this session) the added latency should be small, but it is a real, generation-time-bound delay between the text appearing and the audio starting.
- **One reply speaks at a time.** If a new voice message is sent while a previous reply is still speaking, decision #6 already stops the old audio before the new recording starts — there's no scenario where two replies' audio could overlap.
- **No new environment variable, no new dependency, no schema change** — `generateSpeech`/`openai.speech` are already available in the installed `ai`/`@ai-sdk/openai` versions, same as `disala-10`'s transcription addition.
- **Real, additional per-reply cost**, separate from the existing chat and transcription costs — worth a quick sanity check against OpenAI's current TTS pricing yourself, as flagged for transcription in `disala-10`.
- **No persistence of generated audio.** Like the uploaded recordings in `disala-10`, the synthesized clip lives only in the browser's memory for the duration of playback (as an object URL) and server-side only for the duration of the single request — no new storage, no new database column.

## Files expected to change

New:
- `app/api/speak/route.ts` — `POST` handler: `auth()` gate, `{ text }` validation, `generateSpeech()`, return raw `audio/mpeg` bytes or a JSON error with a non-200 status.

Modified:
- `components/disala/voice-sheet.tsx` — `handleSend` accepts an optional `{ speak?: boolean }`; `handleTranscribed` passes `{ speak: true }`; new local state for the current `Audio` element / "Speaking…" / pending-tap-to-play; `handleMicClick` stops any active playback before starting a recording (decision #6); the sheet's close/unmount path stops playback and revokes the object URL.

Not touched: `app/api/chat/route.ts`, `app/api/transcribe/route.ts`, `components/disala/use-voice-recorder.ts`, `lib/agent/*`, `lib/integrations/*`, `lib/approvals.ts`, `components/disala/chat-composer.tsx`, `components/disala/chat-transcript.tsx`, `components/disala/voice-orb.tsx`, `prisma/schema.prisma`, `package.json`.

## Functional requirements

- Sending a message by voice and receiving a reply results in that reply being spoken aloud shortly after its text appears, using a consistent OpenAI voice.
- Sending a typed message never triggers spoken audio.
- While Disala is speaking, the voice screen shows a "Speaking…" indicator with an explicit stop control.
- Tapping "Start talking" while Disala is speaking immediately stops the audio and begins a new recording (no need to tap a separate stop control first).
- If the browser blocks automatic playback, a visible "Play reply" control appears and works on a single tap — the reply is never silently lost.
- Closing the voice sheet while a reply is speaking stops the audio immediately.
- A text-to-speech failure never removes, blocks, or delays the text reply that already rendered.

## Security considerations

- `/api/speak` requires a signed-in Clerk session (`auth()` → 401), identical to `/api/chat`/`/api/transcribe` — no anonymous access to a billable OpenAI endpoint.
- The `text` sent to `/api/speak` is always the assistant's own already-generated reply content already shown to the same signed-in user — no new user-controllable input reaches a new capability. This is not a text field a user can populate arbitrarily to spend the OpenAI account's TTS budget on unrelated content.
- No audio is stored server-side; nothing is written to the database. The response is streamed back and discarded.

## AI/agent behavior

Not applicable — no agent tool, system prompt, or model-facing change. The agent still only ever produces text; speech is a client-side rendering choice applied to that text after the fact.

## Approval requirements

Not applicable — this adds an output *presentation* for an answer that has already been computed and shown as text. It has no external effect beyond audio playback in the user's own browser.

## Error handling

- `/api/speak` returns `401` (not signed in), `400` (missing/oversized text), or `502` (the speech generation call itself failed) — mirroring the conventions `/api/chat` and `/api/transcribe` already established. It never throws past its own boundary.
- A failed or blocked playback attempt never touches `sendError` or the rendered text reply — it only affects whether audio is heard, per decision #8.

## Acceptance criteria

- Sending a real voice message produces a spoken reply in a real OpenAI voice, audible without any extra tap under normal browser conditions.
- Sending a typed message produces no audio.
- Tapping "Start talking" mid-reply stops the audio and starts recording immediately — verified by the audio actually going silent, not just the UI changing.
- Simulating a blocked-autoplay browser state (or genuinely testing on one, e.g. iOS Safari after some delay) shows a working manual "Play reply" control instead of losing the reply.
- Killing network access to `/api/speak` (or forcing it to fail) still leaves the correct text reply visible with no error banner.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`. Open the voice sheet, tap "Start talking", ask a real question, stop recording. Confirm the text reply appears, then the same reply plays as audio shortly after.
2. While it's still speaking, tap "Start talking" again. Confirm the audio stops immediately and a new recording begins.
3. Let a reply finish speaking naturally. Confirm it doesn't restart or loop.
4. Switch to "Type instead", send a typed message. Confirm the reply appears as text only — no audio.
5. Close the sheet while a reply is mid-speech. Reopen it. Confirm no audio continues playing in the background.
6. If you have access to a browser/device known to block autoplay (e.g. iOS Safari, or a desktop browser with a strict autoplay site setting), send a voice message there and confirm a tappable "Play reply" control appears and works.
7. Temporarily point `/api/speak` at a bad request (or block it via devtools' network throttling to force a failure) and confirm the text reply still renders normally with no error shown.
8. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Manual setup required before I can implement/test this

None — `OPENAI_API_KEY` is already configured and already used by `/api/chat` and (since `disala-10`) `/api/transcribe`; the same key covers text-to-speech. No new environment variable, no new dependency, no dashboard change.

Is this good to execute?
