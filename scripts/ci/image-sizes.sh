#!/usr/bin/env bash
# Print compressed download size per platform for a pushed multi-arch image,
# and append the same table to $GITHUB_STEP_SUMMARY when running in GHA.
set -euo pipefail

tag="${1:?usage: image-sizes.sh <image:tag>}"
ref="${tag%:*}"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  exec > >(tee -a "$GITHUB_STEP_SUMMARY")
fi

echo "### \`${tag}\`"
echo
echo "| Platform | Compressed |"
echo "|---|---|"
docker buildx imagetools inspect "$tag" --raw \
  | jq -r '.manifests[]? | select(.platform.os != "unknown") | "\(.platform.os)/\(.platform.architecture)\t\(.digest)"' \
  | while IFS=$'\t' read -r plat digest; do
      bytes=$(docker buildx imagetools inspect "${ref}@${digest}" --raw \
        | jq '[(.layers // [])[].size // 0, (.config.size // 0)] | add')
      mib=$(awk -v b="$bytes" 'BEGIN { printf "%.1f", b/1024/1024 }')
      printf "| %s | %s MiB |\n" "$plat" "$mib"
    done
echo
