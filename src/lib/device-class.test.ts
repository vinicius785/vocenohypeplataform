import { describe, expect, it } from "vitest";
import { classifyDevice, deviceLabel } from "./device-class";

describe("classifyDevice", () => {
  it("celular, tablet e computador", () => {
    expect(
      classifyDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("mobile");
    expect(
      classifyDevice(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      ),
    ).toBe("mobile");
    expect(
      classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("tablet");
    expect(
      classifyDevice(
        "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      ),
    ).toBe("tablet");
    expect(
      classifyDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      ),
    ).toBe("desktop");
    expect(
      classifyDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      ),
    ).toBe("desktop");
  });
  it("sem user-agent não chuta", () => {
    expect(classifyDevice(undefined)).toBeNull();
    expect(classifyDevice("  ")).toBeNull();
  });
  it("rótulos", () => {
    expect(deviceLabel("mobile")).toBe("Celular");
    expect(deviceLabel("desktop")).toBe("Computador");
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel("xyz")).toBeNull();
  });
});
