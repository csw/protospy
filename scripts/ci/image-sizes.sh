#!/usr/bin/env bash
# Print compressed download size per platform for a pushed multi-arch image.
# Sums layer + config blob sizes from each platform's manifest.
set -euo pipefail

tag="${1:?usage: image-sizes.sh <image:tag>}"
ref="${tag%:*}"

echo "Pushed: ${tag}"
docker buildx imagetools inspect "$tag" --raw \
  | jq -r '.manifests[]? | select(.platform.os != "unknown") | "\(.platform.os)/\(.platform.architecture)\t\(.digest)"' \
  | while IFS=$'\t' read -r plat digest; do
      bytes=$(docker buildx imagetools inspect "${ref}@${digest}" --raw \
        | jq '[(.layers // [])[].size // 0, (.config.size // 0)] | add')
      mib=$(awk -v b="$bytes" 'BEGIN { printf "%.1f", b/1024/1024 }')
      printf "  %-15s %6s MiB compressed\n" "$plat" "$mib"
    done
