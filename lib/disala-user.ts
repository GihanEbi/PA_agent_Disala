import { currentUser } from "@clerk/nextjs/server"

async function getHeaderIdentity() {
  const user = await currentUser()
  const name = user?.firstName ?? "there"
  const avatarInitial = (user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "?")
    .charAt(0)
    .toUpperCase()

  return { name, avatarInitial, online: !!user }
}

export { getHeaderIdentity }
