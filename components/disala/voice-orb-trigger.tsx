"use client"

import { VoiceOrb } from "@/components/disala/voice-orb"
import { useVoiceSheet } from "@/components/disala/voice-sheet-context"

function VoiceOrbTrigger({ size }: { size?: number }) {
  const { openSheet } = useVoiceSheet()

  return (
    <button type="button" onClick={openSheet} aria-label="Talk to Disala">
      <VoiceOrb size={size} />
    </button>
  )
}

export { VoiceOrbTrigger }
