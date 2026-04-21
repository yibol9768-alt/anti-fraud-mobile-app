"""Headless screenshot capture for the A30 Expo web build.

Reuses Playwright's bundled Chromium. Sets up auth state in localStorage
so the auth gate doesn't redirect every page back to /login, then visits
each route and writes a 1x viewport PNG into docs/figures/.

Usage:
    python3 docs/figures/scripts/capture_screens.py
Requires:
    Expo metro web server running on http://localhost:8081
    bun server/_core/index.ts on http://localhost:3000 (so detect/chat/report
    have something to render against)
"""
from __future__ import annotations

import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIG = ROOT / "figures"
FIG.mkdir(parents=True, exist_ok=True)

BASE = os.environ.get("A30_WEB_BASE", "http://localhost:8081")

AUTH_PROFILE = {
    "name": "演示用户",
    "phone": "13800138000",
    "emergencyName": "家人",
    "emergencyPhone": "13900139000",
    "emergencyRelation": "子女",
}

# (slug, route, description, optional pre-action js)
SHOTS = [
    ("home-screen", "/", "首页(主动防御总览 + 三入口)", None),
    ("phone-defense-screen", "/detect", "检测页 - 语音/电话模式", "[...document.querySelectorAll('button,div')].find(e=>e.textContent==='电话语音')?.click();"),
    ("sms-defense-screen", "/detect", "检测页 - 文本/短信模式", "[...document.querySelectorAll('button,div')].find(e=>e.textContent==='短信内容')?.click();"),
    ("image-detect-screen", "/detect", "检测页 - 截图/图片模式", "[...document.querySelectorAll('button,div')].find(e=>e.textContent==='截图识别')?.click();"),
    ("chat-screen", "/chat", "智能聊天助手", None),
    ("report-center-screen", "/report", "安全监测报告中心", None),
    ("memory-center-screen", "/memory", "记忆中心(短期/长期/事件)", None),
    ("profile-screen", "/profile", "个人画像", None),
    ("guardian-center-screen", "/guardian-settings", "守护中心 + Android 增强开关", None),
    ("login-screen", "/login", "首次注册引导", "localStorage.removeItem('a30-auth-profile-v1');localStorage.removeItem('a30-onboarding-done-v1');"),
    ("onboarding-screen", "/onboarding", "新手引导", "localStorage.setItem('a30-auth-profile-v1', JSON.stringify(" + repr(AUTH_PROFILE).replace("'", '"') + "));localStorage.removeItem('a30-onboarding-done-v1');"),
]

WIDTH, HEIGHT = 414, 896  # iPhone 14 Pro logical


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=2,
            locale="zh-CN",
        )
        # Seed localStorage before any page loads.
        ctx.add_init_script(
            "window.localStorage.setItem('a30-auth-profile-v1', %s);"
            "window.localStorage.setItem('a30-onboarding-done-v1', '1');"
            % (repr(__import__('json').dumps(AUTH_PROFILE)))
        )
        page = ctx.new_page()
        # Warm-up navigation so the bundle is loaded once.
        page.goto(BASE + "/", wait_until="networkidle", timeout=60_000)

        for slug, route, desc, pre in SHOTS:
            url = BASE + route
            print(f"[shot] {slug} -> {route}  ({desc})")
            page.goto(url, wait_until="networkidle", timeout=60_000)
            if pre:
                try:
                    page.evaluate(pre)
                    page.wait_for_timeout(800)
                except Exception as exc:
                    print(f"  pre-action warn: {exc}")
            page.wait_for_timeout(800)
            out = FIG / f"{slug}.png"
            page.screenshot(path=str(out), full_page=False)
            print(f"  -> {out}  {out.stat().st_size // 1024}KB")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
