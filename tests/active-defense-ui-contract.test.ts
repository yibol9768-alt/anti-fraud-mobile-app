import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const homeScreenSource = fs.readFileSync(path.join(projectRoot, "app/(tabs)/index.tsx"), "utf8");
const detectScreenSource = fs.readFileSync(path.join(projectRoot, "app/(tabs)/detect.tsx"), "utf8");
const reportScreenSource = fs.readFileSync(path.join(projectRoot, "app/(tabs)/report.tsx"), "utf8");
const tabLayoutSource = fs.readFileSync(path.join(projectRoot, "app/(tabs)/_layout.tsx"), "utf8");

describe("active defense ui contract", () => {
  it("keeps phone, sms and screenshot as explicit active defense entries on the home screen", () => {
    expect(homeScreenSource).toContain("电话主动防御");
    expect(homeScreenSource).toContain("短信主动防御");
    expect(homeScreenSource).toContain("截图主动防御");
    expect(homeScreenSource).toContain("单手操作优先");
  });

  it("keeps direct blocking actions for hotline calls and reminder sms on the home screen", () => {
    expect(homeScreenSource).toContain("拨打 96110");
    expect(homeScreenSource).toContain("发送提醒短信");
    expect(homeScreenSource).toContain('openSystemUrl("tel:96110")');
    expect(homeScreenSource).toContain('openSystemUrl(`sms:?body=${body}`)');
  });

  it("keeps Android guardian scan and monitoring entrances on the detect screen", () => {
    expect(detectScreenSource).toContain("Android 守护中心");
    expect(detectScreenSource).toContain("授权并开启后台监控");
    expect(detectScreenSource).toContain("扫描最近短信");
    expect(detectScreenSource).toContain("扫描系统图库");
    expect(detectScreenSource).toContain("从系统短信批量导入最近高风险线索");
  });

  it("keeps immediate defense actions on the report screen", () => {
    expect(reportScreenSource).toContain("立即执行的阻断动作");
    expect(reportScreenSource).toContain("拨打 96110 反诈专线");
    expect(reportScreenSource).toContain("发送提醒短信");
    expect(reportScreenSource).toContain("返回继续检测");
  });

  it("preserves the six-tab navigation structure with chat tab", () => {
    expect(tabLayoutSource).toContain('name="index"');
    expect(tabLayoutSource).toContain('name="detect"');
    expect(tabLayoutSource).toContain('name="chat"');
    expect(tabLayoutSource).toContain('name="report"');
    expect(tabLayoutSource).toContain('name="memory"');
    expect(tabLayoutSource).toContain('name="profile"');
  });
});
