import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { extractContactFromImage } from "@/lib/extract-contact-card"

const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  const image = formData?.get("image")
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 })
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Photo is too large" }, { status: 400 })
  }

  const result = await extractContactFromImage(
    new Uint8Array(await image.arrayBuffer()),
    image.type || "image/jpeg"
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ fields: result.data })
}
