import asyncio
import os
from playwright.async_api import async_playwright

async def run():
    os.makedirs('docs/screenshots', exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge', headless=True)
        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()

        print("[TEST] 1. Loading Unified App on single host http://localhost:5174/ ...")
        await page.goto('http://localhost:5174/', wait_until='domcontentloaded')
        await page.wait_for_timeout(3000)

        # Verify only 1 tab exists
        print(f"[TEST] Total browser tabs: {len(context.pages)}")
        assert len(context.pages) == 1, f"Expected 1 tab, found {len(context.pages)}"

        # Verify top unified switcher is visible
        twin_tab_btn = page.locator("button.campusops-tab-btn:has-text('3D Digital Twin')")
        dash_tab_btn = page.locator("button.campusops-tab-btn:has-text('Operations Dashboard')")
        assert await twin_tab_btn.is_visible(), "3D Digital Twin tab button must be visible"
        assert await dash_tab_btn.is_visible(), "Operations Dashboard tab button must be visible"
        print("[TEST] Top unified navigation bar verified.")

        # Save screenshot of 3D Twin in unified shell
        await page.screenshot(path='docs/screenshots/unified_01_twin.png')
        print("[TEST] Saved docs/screenshots/unified_01_twin.png")

        # Click Operations Dashboard tab
        print("[TEST] 2. Switching to Operations Dashboard tab in same window...")
        await dash_tab_btn.click()
        await page.wait_for_timeout(3000)

        # Verify still only 1 tab exists
        print(f"[TEST] Total browser tabs after switching to Dashboard: {len(context.pages)}")
        assert len(context.pages) == 1, f"Expected 1 tab, found {len(context.pages)}"
        assert 'view=dashboard' in page.url, f"Expected view=dashboard in URL, got {page.url}"

        # Verify Dashboard iframe is rendered and accessible
        iframe_elem = page.locator("iframe[title='CampusOps Dashboard']")
        assert await iframe_elem.is_visible(), "Dashboard iframe must be visible"
        frame = page.frame_locator("iframe[title='CampusOps Dashboard']")
        await page.wait_for_timeout(2000)

        # Save screenshot of Dashboard in unified shell
        await page.screenshot(path='docs/screenshots/unified_02_dashboard.png')
        print("[TEST] Saved docs/screenshots/unified_02_dashboard.png")

        # Test Back to 3D Twin from within Dashboard iframe
        print("[TEST] 3. Clicking Back to 3D Twin from Dashboard...")
        back_twin_btn = frame.locator("button:has-text('Back to 3D Twin')").first
        assert await back_twin_btn.is_visible(), "Back to 3D Twin button must be visible in Dashboard iframe"
        await back_twin_btn.click()
        await page.wait_for_timeout(2000)

        # Verify still only 1 tab exists and view is back to twin
        print(f"[TEST] Total browser tabs after returning: {len(context.pages)}")
        assert len(context.pages) == 1, f"Expected 1 tab, found {len(context.pages)}"
        assert 'view=dashboard' not in page.url, f"URL should no longer have view=dashboard, got {page.url}"
        print("[TEST] Successfully returned to 3D Twin in same tab.")

        # Test Dashboard button inside 3D Twin (world-tools button)
        print("[TEST] 4. Testing in-world Dashboard button...")
        in_world_dash_btn = page.locator(".world-tools button:has-text('Dashboard')")
        if await in_world_dash_btn.is_visible():
            await in_world_dash_btn.click()
            await page.wait_for_timeout(2000)
            assert len(context.pages) == 1, f"Expected 1 tab, found {len(context.pages)}"
            assert 'view=dashboard' in page.url, f"Expected view=dashboard in URL, got {page.url}"
            print("[TEST] In-world Dashboard button switched view in same tab without opening new tabs.")

        await browser.close()
        print("[TEST] ALL UNIFIED SINGLE-HOST CHECKS PASSED PERFECTLY!")

if __name__ == '__main__':
    asyncio.run(run())
