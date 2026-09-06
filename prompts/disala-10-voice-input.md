# Disala — Voice input for the chat agent (record → OpenAI transcription → existing chat pipeline)

## Goal

Wire up the "Start talking" mic button in `components/disala/voice-sheet.tsx`, which exists visually but has no `onClick` today, so it actually records the user's voice, transcribes it via OpenAI, and sends the resulting text through the exact same `/api/chat` pipeline a typed message already uses. This is the item `disala-08` explicitly flagged and deferred: *"Voice input is an integration choice nobody has made yet (Whisper, OpenAI's Realtime API, or the browser's own `SpeechRecognition`)."* Per your choice, this phase uses **OpenAI transcription** — record in the browser, upload once, transcribe server-side, then reuse the existing text chat flow unchanged. No spoken (text-to-speech) responses and no live streaming conversation — that's the Realtime API option you explicitly deferred.

## Relevant skills

None packaged for this — `@ai-sdk/openai`'s `transcription()` provider and `ai`'s `transcribe()` function were confirmed directly against the installed package types (`node_modules/@ai-sdk/openai/dist/index.d.ts`, `node_modules/ai/dist/index.d.ts`) rather than assumed, the same discipline `disala-06`/`disala-08` applied to Google's REST endpoints.

## Existing code inspected

- `components/disala/voice-sheet.tsx` (full file) — `"use client"`, holds `mode: "voice" | "chat"`, `messages`, `isSending`, `sendError` in local state. `handleSend(message: string)` already does everything a new message needs: appends the user bubble locally, `POST /api/chat`, appends the assistant reply (with any `approvals`) or sets `sendError`. In `"voice"` mode it renders `VoiceOrb`, four static suggestion chips, a "Type instead" button (`onClick={() => setMode("chat")}`) and a "Start talking" `Button` with **no `onClick` at all** — confirmed by reading the file, not assumed.
- `components/disala/voice-sheet-context.tsx` / `voice-orb-trigger.tsx` / `app-footer.tsx` — `VoiceSheetProvider` mounts one `VoiceSheet` globally; `openSheet()` takes no arguments and always opens into `"voice"` mode. This is the only entry point into the sheet; no change needed here.
- `components/disala/voice-state-chip.tsx` (full file) — an existing generic `{ label, onClose? }` pill, already used in `"chat"` mode for "Disala is thinking…". Reused as-is for "Listening…" / "Transcribing…" states — no new status-chip component needed.
- `app/api/chat/route.ts` (full file) — `POST`, `auth()` → 401 if signed out, `z.object({ message: z.string().min(1).max(4000) })`, returns `{ userMessage, assistantMessage, approvals }` or `{ error }` with a non-200 status. This phase's transcription output feeds into this route completely unchanged — no new field, no bypass.
- `node_modules/@ai-sdk/openai/dist/index.d.ts:1418,1486` — confirmed `openai.transcription(modelId)` exists, with `OpenAITranscriptionModelId` including `'whisper-1'`, `'gpt-4o-mini-transcribe'`, `'gpt-4o-transcribe'`, and others.
- `node_modules/ai/dist/index.d.ts:9283` — confirmed `transcribe({ model, audio, ... })` where `audio: DataContent | URL` (`DataContent` covers `Uint8Array`/`ArrayBuffer`/base64 `string`, the same union `generateText`'s multimodal content already accepts elsewhere in the `ai` SDK), returning `TranscriptionResult` with `.text`, `.language`, `.durationInSeconds`, `.warnings`.
- `package.json` — `ai@^7.0.93`, `@ai-sdk/openai@^4.0.60`, `OPENAI_API_KEY` already configured (used today by `app/api/chat/route.ts`). **No `openai` (raw) package installed, and none is needed** — the already-used `ai`/`@ai-sdk/openai` cover transcription.
- Whole-repo check: no `hooks/` directory exists; the one existing custom hook (`useVoiceSheet`) is colocated in `components/disala/`, not a separate hooks folder — this phase's new hook follows that same colocation.
- Browser API check (not a repo file, but load-bearing for this design): `MediaRecorder`/`getUserMedia` require a secure context. `http://localhost` counts as secure for local dev, so no HTTPS setup is needed to test this locally.

## Architectural decisions

1. **Recording and upload, not live streaming.** The user taps "Start talking", speaks, taps again (or hits a safety time cap) to stop; the full clip is then uploaded once to a new route and transcribed in one call. This is the natural fit for `transcribe()`'s request/response shape (it is not a streaming API) and for the existing chat route's own request/response shape — no WebSocket, no chunked upload, no new infra.
2. **New hook `components/disala/use-voice-recorder.ts`** encapsulates all `MediaRecorder`/`getUserMedia` logic behind `{ state: "idle" | "recording" | "transcribing", error: string | null, start(), stop(), cancel() }`, so `voice-sheet.tsx` stays a thin consumer (same separation `useVoiceSheet` already establishes for the sheet's open/close state). Internally:
   - Feature-detects `navigator.mediaDevices?.getUserMedia` and `window.MediaRecorder`; if either is missing, `start()` immediately reports a "voice input isn't supported in this browser" error rather than throwing.
   - Picks the first mime type `MediaRecorder.isTypeSupported()` accepts from `["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]` — covers Chrome/Edge/Firefox (`webm`) and Safari (`mp4`/`aac`) without transcoding anything client-side.
   - Enforces a **120-second max recording** via `setTimeout`, auto-stopping (not discarding) at the cap — long enough for any realistic spoken request, short enough to bound cost and upload size.
   - On `stop()`, assembles the recorded chunks into a `Blob`, `POST`s it as `multipart/form-data` to `/api/transcribe`, and resolves to the transcribed text (or an error). Every code path — success, transcription error, network error, empty transcript — explicitly stops every `MediaStreamTrack` obtained from `getUserMedia` (`track.stop()`), so the browser's mic-in-use indicator never stays on after this hook is done, including on `cancel()` and on unmount.
   - `cancel()` stops the recorder and the tracks and discards the audio — no upload happens. Used when the sheet is closed or "Type instead" is tapped mid-recording.
3. **New route `app/api/transcribe/route.ts`** — `POST`, gated by `auth()` exactly like `/api/chat` (401 if signed out; this exists to prevent an unauthenticated caller from running up the OpenAI transcription bill, not because transcription itself touches any stored user data). Reads a `multipart/form-data` body, pulls the `audio` field as a `File`, rejects if missing or over a **25 MB** cap (Whisper's own documented file-size limit) with `400`, calls `transcribe({ model: openai.transcription("whisper-1"), audio: await file.arrayBuffer() })`, and returns `{ text: result.text.trim() }`. A transcription that comes back empty/whitespace-only (silence, or a clip too short to contain speech) is **not** an error — it's returned as `{ text: "" }` and the client decides what an empty transcript means (decision #5).
4. **`whisper-1` is the model, as a single named constant** (`TRANSCRIPTION_MODEL_ID`), not hardcoded inline — the SDK type also allows `gpt-4o-mini-transcribe`/`gpt-4o-transcribe`, which may be cheaper or more accurate; swapping later is a one-line change. `whisper-1` is chosen as the safe, long-established default since this phase doesn't have a reason to prefer one of the newer models over the other without your input, and nothing about the rest of the design depends on which one is picked.
5. **A successful non-empty transcription automatically switches the sheet to `"chat"` mode and calls the existing `handleSend(text)`** — the same function a typed message already uses, unchanged. This matches how a voice assistant is expected to behave (you speak, it answers) and means the transcribed text is always visible in the transcript as a normal "you said" bubble, so you can immediately see and correct anything misheard by typing or recording again — rather than adding a second "review the transcript before sending" step that a typed message doesn't get either. An **empty** transcription does *not* call `handleSend` (the chat route's own `z.string().min(1)` would reject it anyway) — instead the sheet shows "I didn't catch that — try again" via the existing `VoiceStateChip` and returns to the voice screen.
6. **No text-to-speech, no new agent tool, no change to `app/api/chat/route.ts` or `lib/agent/*`.** Voice is purely an alternate way to produce the text `handleSend` already accepts — everything downstream (approval-gating, tool calls, system prompt) is identical to typing the same words. This preserves every safety property the approval system already has: nothing about this phase makes any action easier to trigger than typing it would.
7. **UI state reuses existing primitives only** (per `AGENTS.md` §3 — no new design surface without a reference): the "Start talking" button toggles between the mic icon (idle) and a stop/square icon (recording) using the same `Button` component and size; `"Listening…"` / `"Transcribing…"` states render via the already-existing `VoiceStateChip`, shown in place of the suggestion grid while recording/transcribing so it's clear something is happening; a mic/permission error reuses the same plain-text red error style `voice-sheet.tsx` already uses for `sendError`.

## Assumptions

- **No spoken/audio response from Disala.** This phase is speech-in, text-out, matching your chosen scope. Text-to-speech would be a separate, later decision.
- **No push-to-talk (hold-to-record).** Tap-to-start / tap-to-stop, which works uniformly for mouse and touch without needing to distinguish a "hold" gesture.
- **The 120-second cap and the 25 MB upload cap are practical safety defaults**, not requirements from you — easy to change, called out as named constants specifically so they're easy to find and adjust.
- **No new rate limiting.** `/api/transcribe` inherits the same standing gap `disala-07` already flagged for `/api/chat` — an authenticated user can call it repeatedly, and nothing in this codebase rate-limits any endpoint yet. Not fixed here; not made worse by this phase either (it's authenticated, exactly like chat already is).
- **Transcription cost is a new, small, real cost** on top of the existing per-message chat cost — you should sanity-check OpenAI's current transcription pricing yourself since I'm not fetching live pricing as part of this prompt; nothing in this design makes that cost unbounded (bounded by the 120s cap per request, same lack of rate limiting as the rest of the app today).
- **Browser support**: any modern Chromium/Firefox/Safari desktop or mobile browser supports `getUserMedia` + `MediaRecorder` over `localhost`/HTTPS. A browser without either gets an honest in-sheet message and can still use "Type instead" — voice is additive, never a dead end.
- **No change to `/settings/connections` or Google scopes** — transcription is entirely between the browser, this app's server, and OpenAI; it has nothing to do with the Google integration.

## Files expected to change

New:
- `app/api/transcribe/route.ts` — `POST` handler: `auth()` gate, parse `multipart/form-data`, size/presence validation, call `transcribe()`, return `{ text }` or `{ error }`.
- `components/disala/use-voice-recorder.ts` — the recording/upload hook described in decision #2.

Modified:
- `components/disala/voice-sheet.tsx` — wire the "Start talking" button to `useVoiceRecorder`; add the listening/transcribing UI states; call `handleSend` on a successful non-empty transcript; wire `cancel()` into the sheet's close (`onClose`) and into "Type instead" when tapped mid-recording.

Not touched: `app/api/chat/route.ts`, `lib/agent/*`, `lib/integrations/*`, `lib/approvals.ts`, `components/disala/voice-sheet-context.tsx`, `components/disala/voice-orb.tsx`, `components/disala/voice-orb-trigger.tsx`, `components/disala/chat-composer.tsx`, `components/disala/chat-transcript.tsx`, `components/disala/app-footer.tsx`, `prisma/schema.prisma`, `package.json`.

## Functional requirements

- Opening the voice sheet and tapping "Start talking" requests microphone permission (first time only, per browser's own permission UI) and begins recording; the button visually flips to a "stop" state and a "Listening…" chip replaces the suggestion grid.
- Tapping the button again (or reaching the 120-second cap) stops recording and shows "Transcribing…" while the clip uploads.
- A successful, non-empty transcription switches to the chat transcript view showing the recognized text as the user's message, followed by Disala's real response (and any approval cards), exactly as if it had been typed.
- A successful but empty transcription (silence) shows "I didn't catch that — try again" and returns to the voice screen without sending anything.
- Denied/unavailable microphone access, or a browser lacking the required APIs, shows a clear, honest in-sheet message and leaves "Type instead" fully usable.
- A transcription request that fails (network error, OpenAI error) shows an honest "Couldn't transcribe that — try again" message and returns to the voice screen — no partial/garbled text is ever sent to chat.
- Closing the sheet or switching to "Type instead" while recording or transcribing immediately stops the microphone (no lingering browser mic-in-use indicator) and discards the in-progress audio.

## Security considerations

- `/api/transcribe` requires a signed-in Clerk session (`auth()` → 401), identical to `/api/chat` — no anonymous access to a billable OpenAI endpoint.
- The uploaded audio is never persisted — it exists only in memory for the duration of the single `transcribe()` call and is discarded once the response is sent. No new database table, no file storage.
- No new data crosses into the model beyond what typing already sends: the transcribed text goes through the exact same `chatRequestSchema` validation and the exact same tool/approval pipeline as a typed message. Voice cannot reach any capability text input can't.
- File size is capped server-side (25 MB) before it's handed to the transcription call, so an oversized upload is rejected cheaply rather than passed through.

## AI/agent behavior

Not applicable beyond what already exists — no new tool, no system prompt change. The agent never knows or cares whether a message originated from typing or from a transcribed recording; both arrive at `/api/chat` as the same `{ message: string }`.

## Approval requirements

Not applicable — this phase adds an input method, not an action. Every existing approval-gated behavior (`propose_email`, `propose_meeting`, etc.) still requires the same explicit approval regardless of whether the request that triggered it was typed or spoken.

## Error handling

- `/api/transcribe` returns `401` (not signed in), `400` (missing/oversized/unreadable audio field), or `502` (the transcription call itself failed) — mirroring `/api/chat`'s existing status-code conventions. It never throws past its own boundary.
- The hook surfaces exactly three user-facing failure messages, each distinct so the user knows what to do next: unsupported browser/API, microphone permission denied, and transcription failed — plus the non-error "I didn't catch that" empty-transcript case.
- Every exit path (success, every error, and explicit cancel) releases the microphone stream. This is verified manually (step 6 below), not just asserted — a stuck "recording" indicator after an error would be a real, user-visible bug.

## Acceptance criteria

- Tapping "Start talking", speaking a real request ("what's on my calendar today"), and stopping produces the correct transcribed text in the chat transcript and a real response from Disala, functionally identical to typing the same sentence.
- Denying the microphone permission prompt shows an honest message and never leaves the sheet stuck on "Listening…".
- Recording silence (say nothing, then stop) shows "I didn't catch that" and does not call `/api/chat` with an empty or garbage message.
- Closing the sheet mid-recording stops the browser's microphone indicator immediately.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`. Open the voice sheet (footer mic button). Tap "Start talking", allow the microphone permission prompt, say "What's on my calendar today?", tap the button again to stop.
2. Confirm "Transcribing…" appears briefly, then the sheet switches to the chat view showing your transcribed sentence as the user message, followed by a real answer from Disala.
3. Reopen the sheet, tap "Start talking", say nothing for a couple of seconds, tap stop. Confirm "I didn't catch that — try again" appears and no message was sent (check the conversation history didn't grow).
4. Reopen the sheet, tap "Start talking", then immediately close the sheet (X or backdrop) while it's recording. Confirm your OS/browser's microphone-in-use indicator turns off right away.
5. In your browser's site settings, block microphone access for localhost, then tap "Start talking". Confirm an honest permission-denied message appears and "Type instead" still works normally.
6. Tap "Start talking", start speaking, and let it run past 120 seconds without tapping stop. Confirm it auto-stops and transcribes rather than recording indefinitely.
7. Test in at least one Chromium-based browser and one other engine (Firefox or Safari) to confirm the mime-type fallback in decision #2 actually produces a working recording in both.
8. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Manual setup required before I can implement/test this

None — `OPENAI_API_KEY` is already configured and already used by `/api/chat`; the same key covers the transcription endpoint. No new environment variable, no new dependency, no dashboard change.

One thing worth doing yourself before testing: quickly check OpenAI's current transcription pricing on their pricing page, since this adds a new (small) per-use cost distinct from the chat cost you're already paying.

Is this good to execute?
