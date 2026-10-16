const test = require("node:test");
const assert = require("node:assert");
const { sourceInfo } = require("../chrome-extension/source.js");

test("YouTube 视频：链接带时间点（往前留 2 秒），标题去掉通知数和站名", () => {
  assert.deepStrictEqual(
    sourceInfo("https://www.youtube.com/watch?v=abc123&list=x", "(3) Lecture 1 - YouTube", 754.8),
    { url: "https://youtu.be/abc123?t=752", title: "Lecture 1" }
  );
});

test("时间点不会小于 0", () => {
  assert.strictEqual(sourceInfo("https://www.youtube.com/watch?v=abc", "t", 1.2).url, "https://youtu.be/abc?t=0");
});

test("读不到播放时间时保留原链接，仍清理标题", () => {
  assert.deepStrictEqual(
    sourceInfo("https://www.youtube.com/watch?v=abc", "Talk - YouTube", null),
    { url: "https://www.youtube.com/watch?v=abc", title: "Talk" }
  );
});

test("非 YouTube 视频页原样返回", () => {
  assert.deepStrictEqual(sourceInfo("https://example.com/(1)", "(1) Inbox - YouTube", 10), {
    url: "https://example.com/(1)",
    title: "(1) Inbox - YouTube",
  });
  assert.deepStrictEqual(sourceInfo("https://www.youtube.com/results?q=a", "(2) a - YouTube", 10), {
    url: "https://www.youtube.com/results?q=a",
    title: "(2) a - YouTube",
  });
  assert.deepStrictEqual(sourceInfo("", "", null), { url: "", title: "" });
});
