cask "airi" do
  arch arm: "arm64", intel: "x64"

  version "0.9.0-alpha.18"
  sha256 arm:   "a9f964c4588e0f49b65d1baeac8281be10d133b165014a82dad8420007ad0a0a",
         intel: "66305d0e738b555c730078829d02f363e841785990698f447cfbb49236266c29"

  url "https://github.com/moeru-ai/airi/releases/download/v#{version}/AIRI-#{version}-darwin-#{arch}.dmg",
      verified: "github.com/moeru-ai/airi/"
  name "AIRI"
  desc "Self-hosted AI companion desktop app with voice chat and game integrations"
  homepage "https://airi.moeru.ai/"

  app "AIRI.app"

  caveats do
    <<~EOS
      AIRI is not yet notarized by Apple. If you receive a "damaged" or "can't be opened" error, run:
        sudo xattr -c '/Applications/AIRI.app'
    EOS
  end

  zap trash: [
    "~/Library/Application Support/airi",
    "~/Library/Preferences/moeru-ai.airi.plist",
    "~/Library/Saved Application State/moeru-ai.airi.savedState",
  ]
end
