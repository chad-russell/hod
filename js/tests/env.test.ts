import { describe, expect, test } from "bun:test";
import { appendPath, depPath, depSubpath, depSubpathList, mergeEnv, pathList } from "../src/index.js";

describe("generic environment helpers", () => {
  test("dependency paths use Hod sandbox mount convention", () => {
    expect(depPath("zlib")).toBe("/deps/zlib");
    expect(depSubpath("zlib", "include")).toBe("/deps/zlib/include");
    expect(depSubpath("zlib", "/include/./ncursesw/")).toBe("/deps/zlib/include/ncursesw");
  });

  test("path list helpers preserve caller order", () => {
    expect(pathList(["/b", "/a"])).toBe("/b:/a");
    expect(depSubpathList(["b", "a"], "bin")).toBe("/deps/b/bin:/deps/a/bin");
  });

  test("appendPath and mergeEnv are left-to-right explicit composition", () => {
    expect(appendPath("/a", ["/b", "/c"])).toBe("/a:/b:/c");
    expect(mergeEnv({ A: "1", B: "1" }, { B: "2" })).toEqual({ A: "1", B: "2" });
  });

  test("invalid dependency names and escaping subpaths are rejected", () => {
    expect(() => depPath("")).toThrow();
    expect(() => depPath("a/b")).toThrow();
    expect(() => depSubpath("a", "../escape")).toThrow();
  });
});
