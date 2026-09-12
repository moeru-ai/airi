export async function continueProviderCreationNavigation(
  navigate: () => Promise<unknown>,
  isActive: () => boolean,
  installResolutionWatch: () => void,
) {
  await navigate()
  if (!isActive())
    return false

  installResolutionWatch()
  return true
}
