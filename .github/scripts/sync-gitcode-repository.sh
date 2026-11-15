#!/usr/bin/env bash

# Removes temporary credentials on both successful and failed runs.
cleanup_gitcode_credentials() {
  rm -f "${WORK_DIR}"/*.curlrc "${WORK_DIR}/git-askpass.sh"
}

# Restricts PAT use to this child Git process instead of a URL or global configuration.
mirror_git() {
  LC_ALL=C GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="${WORK_DIR}/git-askpass.sh" \
    git -c credential.helper= "$@"
}

# Fetches canonical objects into a disposable checkout and keeps credentials outside Git history.
prepare_gitcode_repository() {
  local request_config="${WORK_DIR}/git-user.curlrc"
  GITCODE_REPOSITORY_DIR="${WORK_DIR}/repository"
  export GIT_LFS_SKIP_SMUDGE=1
  write_gitcode_curl_config "/user" "${request_config}"
  GITCODE_GIT_USERNAME="$(curl --retry 3 --retry-all-errors -fsS --config "${request_config}" | jq -er '.login')"
  export GITCODE_GIT_USERNAME

  cat > "${WORK_DIR}/git-askpass.sh" <<'ASKPASS'
#!/usr/bin/env bash
case "$1" in
  "Username for 'https://gitcode.com': ") printf '%s\n' "$GITCODE_GIT_USERNAME" ;;
  "Password for 'https://"*"@gitcode.com': ") printf '%s\n' "$GITCODE_TOKEN" ;;
  *) exit 1 ;;
esac
ASKPASS
  chmod 700 "${WORK_DIR}/git-askpass.sh"

  git check-ref-format "refs/tags/${RELEASE_TAG}"
  mirror_git clone --no-checkout --single-branch --branch main \
    "${GITCODE_REPOSITORY_URL:-https://gitcode.com/${GITCODE_OWNER}/${GITCODE_REPO}.git}" "${GITCODE_REPOSITORY_DIR}"
  git -C "${GITCODE_REPOSITORY_DIR}" remote add github \
    "${GITHUB_REPOSITORY_URL:-https://github.com/${GITHUB_REPOSITORY_NAME}.git}"
  mirror_git -C "${GITCODE_REPOSITORY_DIR}" fetch --no-tags github \
    "refs/heads/main:refs/remotes/github/main" \
    "+refs/tags/${RELEASE_TAG}:refs/tags/${RELEASE_TAG}"
  GITCODE_TARGET_COMMITISH="$(git -C "${GITCODE_REPOSITORY_DIR}" rev-parse "refs/tags/${RELEASE_TAG}^{commit}")"
  git -C "${GITCODE_REPOSITORY_DIR}" config user.name 'github-actions[bot]'
  git -C "${GITCODE_REPOSITORY_DIR}" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
}

# Repairs only the requested tag, including annotated tag objects, with an exact remote lease.
sync_gitcode_tag() {
  local canonical expected actual attempt
  canonical="$(git -C "${GITCODE_REPOSITORY_DIR}" rev-parse "refs/tags/${RELEASE_TAG}")"
  for attempt in 1 2 3; do
    expected="$(mirror_git -C "${GITCODE_REPOSITORY_DIR}" ls-remote origin "refs/tags/${RELEASE_TAG}" | awk '{print $1}')"
    if [[ "${expected}" == "${canonical}" ]]; then
      return
    fi
    if mirror_git -C "${GITCODE_REPOSITORY_DIR}" push \
      "--force-with-lease=refs/tags/${RELEASE_TAG}:${expected}" origin \
      "refs/tags/${RELEASE_TAG}:refs/tags/${RELEASE_TAG}"; then
      actual="$(mirror_git -C "${GITCODE_REPOSITORY_DIR}" ls-remote origin "refs/tags/${RELEASE_TAG}" | awk '{print $1}')"
      [[ "${actual}" == "${canonical}" ]] && return
    fi
  done
  echo "::error::Could not synchronize the canonical release tag."
  return 1
}

# Selects the current stable release and refuses to link a homepage to incomplete mirror assets.
prepare_gitcode_readme_release() {
  local stable_tag request_config
  gh api "repos/${GITHUB_REPOSITORY_NAME}/releases/latest" > "${WORK_DIR}/readme-release.json"
  stable_tag="$(jq -er 'select(.prerelease == false and .draft == false) | .tag_name' "${WORK_DIR}/readme-release.json")"
  request_config="${WORK_DIR}/readme-release.curlrc"
  write_gitcode_curl_config "/repos/${GITCODE_OWNER}/${GITCODE_REPO}/releases/tags/$(urlencode "${stable_tag}")" "${request_config}"
  curl --retry 3 --retry-all-errors -fsS --config "${request_config}" > "${WORK_DIR}/readme-mirror.json"
  if ! jq -e --slurpfile source "${WORK_DIR}/readme-release.json" '
    .assets as $mirrored |
    [$source[0].assets[] | select(.name | test("^(AIRI-.*|latest-.*\\.yml)$"))] as $expected |
    ($expected | length) > 0 and all($expected[];
      . as $asset | any($mirrored[]; .name == $asset.name and .size == $asset.size and .digest == $asset.digest))
  ' "${WORK_DIR}/readme-mirror.json" > /dev/null; then
    echo "::error::The stable mirror is incomplete. The homepage was not updated."
    return 1
  fi
}

# Preserves mirror history and retries fast-forward pushes after concurrent mobile or desktop runs.
sync_gitcode_repository() {
  local attempt conflicts
  for attempt in 1 2 3; do
    mirror_git -C "${GITCODE_REPOSITORY_DIR}" fetch --no-tags github "refs/heads/main:refs/remotes/github/main"
    mirror_git -C "${GITCODE_REPOSITORY_DIR}" fetch --no-tags origin "refs/heads/main:refs/remotes/origin/main"
    git -C "${GITCODE_REPOSITORY_DIR}" checkout --detach refs/remotes/origin/main
    if ! git -C "${GITCODE_REPOSITORY_DIR}" merge --no-commit --no-ff refs/remotes/github/main; then
      conflicts="$(git -C "${GITCODE_REPOSITORY_DIR}" diff --name-only --diff-filter=U)"
      if [[ "${conflicts}" != 'README.md' ]]; then
        echo "::error::Upstream conflicts outside the generated homepage require review."
        return 1
      fi
    fi

    prepare_gitcode_readme_release
    node "${SCRIPT_DIR}/render-gitcode-readme.ts" \
      "${GITCODE_REPOSITORY_DIR}/docs/README.zh-CN.md" "${WORK_DIR}/readme-release.json" \
      "${GITCODE_REPOSITORY_DIR}/README.md" "${GITCODE_OWNER}" "${GITCODE_REPO}" "${GITHUB_REPOSITORY_NAME}"
    git -C "${GITCODE_REPOSITORY_DIR}" add README.md
    git -C "${GITCODE_REPOSITORY_DIR}" diff --cached --check
    if ! git -C "${GITCODE_REPOSITORY_DIR}" diff --cached --quiet || \
      git -C "${GITCODE_REPOSITORY_DIR}" rev-parse -q --verify MERGE_HEAD > /dev/null; then
      git -C "${GITCODE_REPOSITORY_DIR}" commit -m 'chore(sync): update GitCode code and Chinese README'
    fi
    if mirror_git -C "${GITCODE_REPOSITORY_DIR}" push origin HEAD:refs/heads/main; then
      echo "Synchronized GitCode source, tag, and Chinese README."
      return
    fi
  done
  echo "::error::Concurrent updates prevented the GitCode main push. Rerun synchronization."
  return 1
}
