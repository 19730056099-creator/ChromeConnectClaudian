// YouTube 字幕：可框选、右键弹出 Chrome 原生菜单（含「发送到 Claudian」）、鼠标悬停时暂停
(() => {
  const CAPTION = ".ytp-caption-window-container .caption-window";
  const captionOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest(CAPTION);
  const video = () => document.querySelector("#movie_player video");

  // 捕获阶段拦住 YouTube 的拖动字幕框、单击暂停、双击全屏和自定义右键菜单；
  // 不 preventDefault，浏览器照常选字、弹出原生右键菜单
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "contextmenu"]) {
    window.addEventListener(type, (e) => captionOf(e.target) && e.stopImmediatePropagation(), true);
  }

  const hasCaptionSelection = () => {
    const s = getSelection();
    return !!s && !s.isCollapsed && !!captionOf(s.anchorNode);
  };

  // 悬停暂停：只是路过就在离开时继续播放；选中了文字则保持暂停，由用户自己恢复
  let hovering = false;
  let pausedByUs = false;
  document.addEventListener("mouseover", (e) => {
    const over = !!captionOf(e.target);
    if (over === hovering) return;
    hovering = over;
    const v = video();
    if (!v) return;
    if (over) {
      if (!v.paused) {
        v.pause();
        pausedByUs = true;
      }
    } else if (pausedByUs) {
      pausedByUs = false;
      if (!hasCaptionSelection()) v.play();
    }
  }, true);
})();
