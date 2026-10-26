#!/usr/bin/env bash
# Видеог вэбэд тохиромжтой MP4 (H.264 720p, AAC, faststart) болгоно.
# Хэрэглээ: scripts/prepare-video.sh <оролтын файл> <id> [movie|short]
# Гаралт: out/movies/<id>.mp4 эсвэл out/shorts/<id>.mp4 — R2 bucket-д яг ийм замаар хуулна.
set -euo pipefail
in=${1:?оролтын файл}; id=${2:?id (movies.json-ийн id)}; kind=${3:-movie}
[[ $id =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "id зөвхөн латин жижиг үсэг, тоо, зураастай байна"; exit 1; }
dir=out/$([ "$kind" = short ] && echo shorts || echo movies); mkdir -p "$dir"
# Shorts босоо (9:16): өндрийг биш өргөнийг 720 болгоно.
scale=$([ "$kind" = short ] && echo "720:-2" || echo "-2:'min(720,ih)'")
ffmpeg -hide_banner -y -i "$in" -map 0:v:0 -map 0:a:0? \
  -c:v libx264 -preset slow -crf 23 -vf "scale=$scale" -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 128k -ac 2 -movflags +faststart "$dir/$id.mp4"
echo
echo "Бэлэн: $dir/$id.mp4"
echo "R2-д хуулах: Cloudflare → R2 → kinotube → Upload, зам: $(basename "$dir")/$id.mp4"
echo "эсвэл (300MB хүртэл): npx wrangler r2 object put kinotube/$(basename "$dir")/$id.mp4 --file $dir/$id.mp4 --remote"
