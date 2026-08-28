#!/usr/bin/env python3
"""수집 결과를 Traffic Catcher Cloudflare KV/R2 업로드 API로 전송한다."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
GROUP_FILES = {
    "realtime": (
        "trends.json",
        "broadcast_top5.json",
        "realtime_trends.csv",
        "signal_realtime_keywords.csv",
    ),
    "discovery": (
        "season_events.json",
        "movie_releases.json",
        "performances.json",
        "netflix_top10.json",
    ),
}


def validate_file(path: pathlib.Path) -> None:
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(f"업로드할 데이터 파일이 없거나 비어 있습니다: {path.name}")
    if path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8") as handle:
            json.load(handle)


def upload_file(base_url: str, token: str, path: pathlib.Path) -> dict:
    endpoint = f"{base_url.rstrip('/')}/api/data/ingest/{urllib.parse.quote(path.name)}"
    body = path.read_bytes()
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix.lower() in {".json", ".csv"}:
        content_type = f"{content_type}; charset=utf-8"

    last_error = ""
    for attempt in range(1, 4):
        request = urllib.request.Request(
            endpoint,
            data=body,
            method="PUT",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": content_type,
                "User-Agent": "TrafficCatcher-GitHub-Data-Uploader/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if response.status == 200 and payload.get("status") == "success":
                    stored = payload.get("stored") or {}
                    kv_required = path.suffix.lower() == ".json"
                    if stored.get("r2") and (not kv_required or stored.get("kv")):
                        return payload
                    last_error = f"Cloudflare 바인딩 미완료: {stored}"
                    break
                last_error = f"HTTP {response.status}: {payload}"
        except urllib.error.HTTPError as error:
            response_text = error.read().decode("utf-8", errors="replace")[:500]
            last_error = f"HTTP {error.code}: {response_text}"
            if error.code not in {429, 500, 502, 503, 504}:
                break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = str(error)

        if attempt < 3:
            time.sleep(attempt * 2)

    raise RuntimeError(f"Cloudflare 업로드 실패 ({path.name}): {last_error or '알 수 없는 오류'}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", choices=sorted(GROUP_FILES), required=True)
    parser.add_argument("--base-url", default=os.getenv("TRAFFIC_DATA_INGEST_URL", ""))
    parser.add_argument("--token", default=os.getenv("TRAFFIC_DATA_INGEST_TOKEN", ""))
    args = parser.parse_args()

    base_url = str(args.base_url or "").strip()
    token = str(args.token or "").strip()
    if not base_url or not token:
        print("[건너뜀] TRAFFIC_DATA_INGEST_URL 또는 TRAFFIC_DATA_INGEST_TOKEN이 설정되지 않았습니다.")
        return 2

    for file_name in GROUP_FILES[args.group]:
        path = ROOT / file_name
        validate_file(path)
        result = upload_file(base_url, token, path)
        stored = result.get("stored") or {}
        print(
            f"[성공] {file_name}: {result.get('bytes', path.stat().st_size):,} bytes "
            f"(KV={bool(stored.get('kv'))}, R2={bool(stored.get('r2'))})"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
