import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import config from "../app.config";

const projectRoot = path.resolve(__dirname, "..");
const selectedLogoUrl =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663473393654/zKyHbWRKLfLvmJKW.png";

describe("branding config", () => {
  it("uses the anti-fraud brand assets in Expo config", () => {
    expect(config.name).toBe("A30 多模态反诈智能助手");
    expect(config.icon).toBe("./assets/images/icon.png");
    expect(config.web?.favicon).toBe("./assets/images/favicon.png");
    expect(config.android?.adaptiveIcon?.foregroundImage).toBe("./assets/images/android-icon-foreground.png");
  });

  it("stores the selected generated logo url in app config source", () => {
    const source = fs.readFileSync(path.join(projectRoot, "app.config.ts"), "utf8");

    expect(source).toContain(`logoUrl: "${selectedLogoUrl}"`);
  });

  it("keeps required brand image assets on disk", () => {
    const assetPaths = [
      "assets/images/icon.png",
      "assets/images/splash-icon.png",
      "assets/images/favicon.png",
      "assets/images/android-icon-foreground.png",
    ];

    assetPaths.forEach((assetPath) => {
      expect(fs.existsSync(path.join(projectRoot, assetPath))).toBe(true);
    });
  });
});
