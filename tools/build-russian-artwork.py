#!/usr/bin/env python3
"""Build an index of image links from the public START and Wink catalog pages."""

import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def pages():
    for kind, count in (("movies", 10), ("series", 10)):
        for page in range(1, count + 1):
            suffix = "" if page == 1 else f"-{page}"
            yield f"wink-{kind}-ru{suffix}", f"https://wink.ru/{kind}/catalog?countries=Russia&page={page}"
    yield "wink-series", "https://wink.ru/series"
    yield "wink-originals", "https://wink.ru/poslepacana"
    yield "wink-sp", "https://wink.ru/series/sp-year-2023"
    yield "start-movies", "https://start.ru/movies/ru"
    yield "start-movies-page2", "https://start.ru/movies/ru?page=2"
    for name, slug in {
        "start": "cheburashka",
        "start2": "soderzhanki",
        "start-kuhnya": "kuhnya",
        "start-otel": "otel-eleon",
        "start-vampiry": "vampiry-sredney-polosy",
        "start-med": "mediator",
        "start-zhizn": "zhit-zhizn",
        "start-posledniy": "posledniy-bogatyr",
        "start-sp": "slovo-pacana",
    }.items():
        yield name, f"https://start.ru/watch/{slug}"


def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)


def start_rows(html):
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    data = json.loads(match[1])["props"]["pageProps"]["data"]
    for item in objects(data):
        slug = item.get("slug", "")
        route = re.fullmatch(r"/(movie|series)/([\w-]+)", slug)
        if not route or not item.get("title") or not item.get("year"):
            continue
        if not any(c.get("code") in ("RU", "SU") or c.get("title") == "СССР" for c in item.get("origin_countries", [])):
            continue
        kind, slug = route.groups()
        if kind == "series" and item.get("_cls") != "Product.Series":
            continue
        seasons = [int(season["year"]) for season in item.get("items", []) if str(season.get("year", "")).isdigit()]
        year = min(seasons) if kind == "series" and seasons else int(item["year"])
        background = (item.get("background") or {}).get("image_15x", "")
        image = re.fullmatch(r"(/poster/[0-9a-f-]+/\d+)\?poster_type=background&dsize=1920x1080", background)
        if image:
            logotype = (item.get("logotype") or {}).get("image_15x", "")
            logo = re.fullmatch(r"(/poster/[0-9a-f-]+/\d+)\?poster_type=logotype", logotype)
            yield ("START", slug, kind, item["title"], year, str(item.get("kinopoisk_id") or ""),
                   image[1], logo[1] if logo else "")


def wink_rows(html):
    match = re.search(r"window\.__REACT_QUERY_STATE__\s*=\s*", html)
    data, _ = json.JSONDecoder().raw_decode(html, match.end())
    for item in objects(data):
        kind = {"series": "series", "film": "movie"}.get(item.get("type")) if isinstance(item.get("type"), str) else None
        if not kind or not item.get("name") or item.get("is_coming_soon"):
            continue
        if not {"Россия", "СССР"}.intersection(item.get("countries") or []):
            continue
        slug = item.get("slug") or ""
        year = str(item.get("year") or "")
        if not re.fullmatch(r"[\w-]+", slug) or not re.fullmatch(r"(?:19|20)\d\d", year):
            continue
        images = tuple(dict.fromkeys(
            image for image in (item.get("visit_card"), item.get("screenshots"))
            if re.fullmatch(r"/images/[a-z0-9]+\.(?:jpg|png|webp)", image or "")
        ))
        if images:
            yield ("Wink", slug, kind, item["name"], int(year), "", *images)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="Directory of previously downloaded HTML snapshots")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "app/russian-artwork-index.js")
    args = parser.parse_args()

    def load(page):
        name, url = page
        try:
            html = ((args.cache / f"{name}.html").read_text() if args.cache else
                    subprocess.check_output(["curl", "-fsSL", "--retry", "1", "--max-time", "20", url], text=True))
            return list((wink_rows if name.startswith("wink") else start_rows)(html))
        except (OSError, AttributeError, KeyError, ValueError, subprocess.CalledProcessError) as error:
            print(f"Skipped {name}: {error}")
            return []

    rows = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for records in pool.map(load, pages()):
            for record in records:
                key = record[:3]
                if key not in rows or len(rows[key]) < len(record):
                    rows[key] = record
    if any(sum(row[0] == source for row in rows.values()) < minimum for source, minimum in (("START", 10), ("Wink", 100))):
        parser.error("Too few records. Check whether the public page structure has changed.")
    lines = [json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in sorted(rows.values())]
    args.out.write_text("/* Generated by tools/build-russian-artwork.py. Public image links only. */\n"
                        "window.WePlayRussianArtworkIndex=[\n" + ",\n".join(lines) + "\n];\n")
    print(f"Indexed {len(rows)} provider records")


if __name__ == "__main__":
    main()
