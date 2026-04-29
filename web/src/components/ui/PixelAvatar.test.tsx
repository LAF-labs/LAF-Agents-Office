import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PixelAvatar } from "./PixelAvatar";

describe("PixelAvatar", () => {
  it("reserves its rendered size before the sprite module loads", () => {
    const { container } = render(<PixelAvatar slug="pm" size={24} />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.style.width).toBe("24px");
    expect(canvas?.style.height).toBe("24px");
  });
});
