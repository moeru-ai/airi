#!/usr/bin/env bash

set -euo pipefail

GITCODE_API_BASE="${GITCODE_API_BASE:-https://api.gitcode.com/api/v5}"
GITHUB_REPOSITORY_NAME="${GITHUB_REPOSITORY:-moeru-ai/airi}"
RELEASE_TAG="${GITCODE_RELEASE_TAG:-${RELEASE_TAG:-${GITHUB_REF_NAME:-}}}"
GITCODE_TARGET_COMMITISH="${GITCODE_TARGET_COMMITISH:-main}"
WORK_DIR="${RUNNER_TEMP:-/tmp}/gitcode-release-${RELEASE_TAG}"
ASSETS_DIR="${WORK_DIR}/assets"

if [[ -z "${RELEASE_TAG}" ]]; then
  echo "::error::Missing release tag. Set GITCODE_RELEASE_TAG or run from a release tag ref."
  exit 1
fi

# Ensures required environment variables are present before any network call.
require_env() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing required environment variable: ${name}"
    exit 1
  fi
}

# Encodes a single path component for GitCode query parameters.
urlencode() {
  jq -nr --arg value "$1" '$value | @uri'
}

# Formats a value for curl's config file syntax.
curl_config_value() {
  jq -Rr @json <<< "$1"
}

# Writes a curl config file for GitCode API calls without putting the token in
# the process argument list.
write_gitcode_curl_config() {
  local path="$1"
  local config_file="$2"

  {
    printf 'url = %s\n' "$(curl_config_value "${GITCODE_API_BASE}${path}")"
    printf 'url-query = %s\n' "$(curl_config_value "access_token=${GITCODE_TOKEN}")"
  } > "${config_file}"

  chmod 600 "${config_file}"
}

# Reads GitHub release metadata and creates the same GitCode release when absent.
ensure_gitcode_release() {
  local github_release_json="${WORK_DIR}/github-release.json"
  local gitcode_release_json="${WORK_DIR}/gitcode-release.json"
  local response_json="${WORK_DIR}/create-release-response.json"
  local request_config="${WORK_DIR}/create-release-request.curlrc"
  local http_status

  gh release view "${RELEASE_TAG}" \
    --repo "${GITHUB_REPOSITORY_NAME}" \
    --json tagName,name,body,isPrerelease \
    > "${github_release_json}"

  jq --arg target_commitish "${GITCODE_TARGET_COMMITISH}" '{
    tag_name: .tagName,
    name: .name,
    body: .body,
    target_commitish: $target_commitish,
    release_status: (if .isPrerelease then "pre" else "latest" end)
  }' "${github_release_json}" > "${gitcode_release_json}"

  write_gitcode_curl_config "/repos/${GITCODE_OWNER}/${GITCODE_REPO}/releases" "${request_config}"

  http_status="$(
    curl --retry 3 --retry-all-errors -sS \
      --config "${request_config}" \
      -o "${response_json}" \
      -w '%{http_code}' \
      -X POST \
      -H 'Content-Type: application/json' \
      --data @"${gitcode_release_json}"
  )"

  if [[ "${http_status}" =~ ^2 ]]; then
    echo "Created GitCode release ${RELEASE_TAG}."
    return
  fi

  if jq -e '.error_code == 409 or (.error_message // "" | contains("Release already exists"))' "${response_json}" >/dev/null 2>&1; then
    echo "GitCode release ${RELEASE_TAG} already exists; reusing it."
    return
  fi

  echo "::error::Failed to create GitCode release ${RELEASE_TAG}; HTTP ${http_status}."
  exit 1
}

# Fetches the current GitCode release assets so repeated workflow runs can skip
# files that were already mirrored.
write_existing_gitcode_asset_names() {
  local release_json="${WORK_DIR}/gitcode-release-current.json"
  local request_config="${WORK_DIR}/get-release-request.curlrc"
  local encoded_tag

  encoded_tag="$(urlencode "${RELEASE_TAG}")"

  write_gitcode_curl_config "/repos/${GITCODE_OWNER}/${GITCODE_REPO}/releases/tags/${encoded_tag}" "${request_config}"

  curl --retry 3 --retry-all-errors -fsS \
    --config "${request_config}" \
    > "${release_json}"

  jq -r '.assets[]?.name' "${release_json}" | sort > "${WORK_DIR}/existing-gitcode-assets.txt"
}

# Writes the GitHub release assets that should be mirrored to GitCode.
write_expected_github_asset_metadata() {
  local release_assets_json="${WORK_DIR}/github-release-assets.json"
  local encoded_tag

  encoded_tag="$(urlencode "${RELEASE_TAG}")"

  gh api "repos/${GITHUB_REPOSITORY_NAME}/releases/tags/${encoded_tag}" \
    > "${release_assets_json}"

  jq -r '.assets[].name | select(test("^(AIRI-.*|latest-.*\\.yml)$"))' "${release_assets_json}" \
    | sort \
    > "${WORK_DIR}/expected-asset-names.txt"

  jq -r '.assets[] | select(.name | test("^(AIRI-.*|latest-.*\\.yml)$")) | [.name, (.digest // "")] | @tsv' "${release_assets_json}" \
    | sort \
    > "${WORK_DIR}/expected-asset-digests.tsv"

  if [[ ! -s "${WORK_DIR}/expected-asset-names.txt" ]]; then
    echo "::error::No GitHub release assets matched AIRI-* or latest-*.yml."
    exit 1
  fi

  if awk -F '\t' '$2 == "" { found = 1 } END { exit found ? 0 : 1 }' "${WORK_DIR}/expected-asset-digests.tsv"; then
    echo "::error::GitHub release assets are missing SHA-256 digests; cannot verify GitCode mirror freshness."
    exit 1
  fi
}

# Builds the public GitCode release download URL for an uploaded asset.
gitcode_download_url() {
  local filename="$1"
  local encoded_filename
  local encoded_tag

  encoded_filename="$(urlencode "${filename}")"
  encoded_tag="$(urlencode "${RELEASE_TAG}")"

  printf 'https://gitcode.com/%s/%s/releases/download/%s/%s' \
    "${GITCODE_OWNER}" \
    "${GITCODE_REPO}" \
    "${encoded_tag}" \
    "${encoded_filename}"
}

# Reads a GitCode asset SHA-256 digest by streaming the public download.
read_gitcode_asset_digest() {
  local filename="$1"
  local download_url

  download_url="$(gitcode_download_url "${filename}")"

  curl --retry 3 --retry-all-errors -fsSL "${download_url}" \
    | sha256sum \
    | awk '{ print "sha256:" $1 }'
}

# Verifies same-name GitCode assets still match the GitHub release asset digests.
verify_gitcode_asset_digests() {
  local mode="${1:-strict}"
  local stale_assets="${WORK_DIR}/stale-gitcode-assets.tsv"
  local stale_names="${WORK_DIR}/stale-gitcode-asset-names.txt"
  local filename
  local expected_digest
  local actual_digest

  : > "${stale_assets}"
  : > "${stale_names}"

  while IFS=$'\t' read -r filename expected_digest; do
    if ! grep -Fxq "${filename}" "${WORK_DIR}/existing-gitcode-assets.txt"; then
      continue
    fi

    if ! actual_digest="$(read_gitcode_asset_digest "${filename}")"; then
      echo "::error::Could not read GitCode asset digest for ${filename}."
      exit 1
    fi

    if [[ -z "${actual_digest}" ]]; then
      echo "::error::Could not read GitCode asset digest for ${filename}."
      exit 1
    fi

    if [[ "${actual_digest}" != "${expected_digest}" ]]; then
      printf '%s\t%s\t%s\n' "${filename}" "${expected_digest}" "${actual_digest}" >> "${stale_assets}"
      printf '%s\n' "${filename}" >> "${stale_names}"
    fi
  done < "${WORK_DIR}/expected-asset-digests.tsv"

  if [[ -s "${stale_assets}" ]]; then
    if [[ "${mode}" == "warn" ]]; then
      echo "::warning::GitCode release contains stale mirrored assets; they will be uploaded again:"
    else
      echo "::error::GitCode release contains stale mirrored assets with digest mismatches:"
    fi

    awk -F '\t' '{ printf "  - %s: GitHub=%s, GitCode=%s\n", $1, $2, $3 }' "${stale_assets}"

    if [[ "${mode}" == "warn" ]]; then
      sort -u -o "${stale_names}" "${stale_names}"
      return
    fi

    echo "::error::GitCode release still has stale mirrored assets after upload."
    exit 1
  fi
}

# Checks whether an existing GitCode asset should be replaced by the GitHub one.
is_stale_gitcode_asset() {
  local filename="$1"
  local stale_names="${WORK_DIR}/stale-gitcode-asset-names.txt"

  [[ -s "${stale_names}" ]] && grep -Fxq "${filename}" "${stale_names}"
}

# Downloads GitHub release assets that are missing from GitCode or stale there.
download_missing_github_release_assets() {
  local missing_names="${WORK_DIR}/missing-before-upload.txt"
  local stale_names="${WORK_DIR}/stale-gitcode-asset-names.txt"
  local upload_names="${WORK_DIR}/asset-names-to-upload.txt"

  rm -rf "${ASSETS_DIR}"
  mkdir -p "${ASSETS_DIR}"

  comm -23 "${WORK_DIR}/expected-asset-names.txt" "${WORK_DIR}/existing-gitcode-assets.txt" > "${missing_names}"
  {
    cat "${missing_names}"
    if [[ -s "${stale_names}" ]]; then
      cat "${stale_names}"
    fi
  } | sort -u > "${upload_names}"

  if [[ ! -s "${upload_names}" ]]; then
    echo "GitCode release ${RELEASE_TAG} already has every mirrored asset."
    : > "${WORK_DIR}/assets-to-upload.txt"
    return
  fi

  while IFS= read -r filename; do
    gh release download "${RELEASE_TAG}" \
      --repo "${GITHUB_REPOSITORY_NAME}" \
      --pattern "${filename}" \
      --dir "${ASSETS_DIR}" \
      --clobber
  done < "${upload_names}"

  find "${ASSETS_DIR}" -maxdepth 1 -type f -print | sort > "${WORK_DIR}/assets-to-upload.txt"
}

# Uploads one local asset through GitCode's pre-signed OBS upload URL.
upload_asset() {
  local file="$1"
  local filename
  local encoded_filename
  local upload_json
  local upload_url
  local upload_url_status
  local response_body
  local http_status
  local x_obs_acl
  local x_obs_callback
  local x_obs_meta_project_id
  local x_obs_content_type
  local request_config
  local encoded_tag

  filename="$(basename "${file}")"

  if grep -Fxq "${filename}" "${WORK_DIR}/existing-gitcode-assets.txt" && ! is_stale_gitcode_asset "${filename}"; then
    echo "Skipping existing GitCode asset: ${filename}"
    return
  fi

  echo "Uploading GitCode asset: ${filename}"

  encoded_filename="$(urlencode "${filename}")"
  encoded_tag="$(urlencode "${RELEASE_TAG}")"
  upload_json="${WORK_DIR}/upload-${filename}.json"
  response_body="${WORK_DIR}/upload-${filename}.response"
  request_config="${WORK_DIR}/upload-url-${filename}.curlrc"

  write_gitcode_curl_config "/repos/${GITCODE_OWNER}/${GITCODE_REPO}/releases/${encoded_tag}/upload_url?file_name=${encoded_filename}" "${request_config}"

  upload_url_status="$(
    curl --retry 3 --retry-all-errors -sS \
      --config "${request_config}" \
      -o "${upload_json}" \
      -w '%{http_code}'
  )"

  if [[ ! "${upload_url_status}" =~ ^2 ]]; then
    write_existing_gitcode_asset_names
    if grep -Fxq "${filename}" "${WORK_DIR}/existing-gitcode-assets.txt" && ! is_stale_gitcode_asset "${filename}"; then
      echo "Skipping concurrently uploaded GitCode asset: ${filename}"
      return
    fi

    echo "::error::Failed to prepare GitCode upload URL for ${filename}; HTTP ${upload_url_status}."
    exit 1
  fi

  {
    IFS=$'\t' read -r upload_url x_obs_meta_project_id x_obs_acl x_obs_callback x_obs_content_type
  } < <(
    jq -r '[
      .url,
      .headers["x-obs-meta-project-id"],
      .headers["x-obs-acl"],
      .headers["x-obs-callback"],
      .headers["Content-Type"]
    ] | @tsv' "${upload_json}"
  )

  http_status="$(
    curl --retry 3 --retry-all-errors -sS \
      -o "${response_body}" \
      -w '%{http_code}' \
      -X PUT \
      -H "x-obs-meta-project-id: ${x_obs_meta_project_id}" \
      -H "x-obs-acl: ${x_obs_acl}" \
      -H "x-obs-callback: ${x_obs_callback}" \
      -H "Content-Type: ${x_obs_content_type}" \
      --upload-file "${file}" \
      "${upload_url}"
  )"

  if [[ ! "${http_status}" =~ ^2 ]]; then
    write_existing_gitcode_asset_names
    if grep -Fxq "${filename}" "${WORK_DIR}/existing-gitcode-assets.txt" && ! is_stale_gitcode_asset "${filename}"; then
      echo "GitCode asset appeared after upload retry: ${filename}"
      return
    fi

    echo "::error::Failed to upload ${filename} to GitCode; HTTP ${http_status}."
    exit 1
  fi
}

# Verifies every downloaded GitHub release asset is visible in the GitCode
# release after upload.
verify_gitcode_release_assets() {
  local current_names="${WORK_DIR}/gitcode-asset-names-after-upload.txt"
  local missing_names="${WORK_DIR}/missing-gitcode-assets.txt"

  write_existing_gitcode_asset_names

  cp "${WORK_DIR}/existing-gitcode-assets.txt" "${current_names}"
  comm -23 "${WORK_DIR}/expected-asset-names.txt" "${current_names}" > "${missing_names}"

  if [[ -s "${missing_names}" ]]; then
    echo "::error::GitCode release is missing mirrored assets:"
    sed 's/^/  - /' "${missing_names}"
    exit 1
  fi

  verify_gitcode_asset_digests

  echo "GitCode release ${RELEASE_TAG} contains all mirrored assets."
}

# Runs the full GitHub Release to GitCode Release mirror flow.
main() {
  require_env GH_TOKEN
  require_env GITCODE_TOKEN
  require_env GITCODE_OWNER
  require_env GITCODE_REPO

  mkdir -p "${WORK_DIR}"

  ensure_gitcode_release
  write_existing_gitcode_asset_names
  write_expected_github_asset_metadata
  verify_gitcode_asset_digests warn
  download_missing_github_release_assets

  while IFS= read -r file; do
    upload_asset "${file}"
  done < "${WORK_DIR}/assets-to-upload.txt"

  verify_gitcode_release_assets
}

main "$@"
