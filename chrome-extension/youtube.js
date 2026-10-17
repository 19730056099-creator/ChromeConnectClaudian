// YouTube 字幕：可框选、右键弹出 Chrome 原生菜单（含「发送到 Claudian」）、鼠标悬停时暂停
(() => {
  // 原生字幕；装了「沉浸式翻译」时原生字幕被隐藏，显示的是它在 Shadow DOM 里画的双语字幕
  const CAPTION = ".ytp-caption-window-container .caption-window, .imt-caption-window";
  const IMT_HOST = "#immersive-translate-caption-window";
  const video = () => document.querySelector("#movie_player video");

  // Shadow DOM 里的事件冒泡到 window 时 target 会被换成宿主，必须看 composedPath
  const onCaption = (e) => e.composedPath().some((n) => n.nodeType === 1 && n.matches(CAPTION));

  const hasCaptionSelection = () => {
    const s = getSelection();
    if (!s || s.isCollapsed) return false;
    const el = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentElement;
    return !!el?.closest(`${CAPTION}, ${IMT_HOST}`);
  };

  // 捕获阶段拦住 YouTube 的拖动字幕框、单击暂停、双击全屏和自定义右键菜单；
  // 不 preventDefault，浏览器照常选字、弹出原生右键菜单
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "auxclick", "dblclick", "contextmenu"]) {
    window.addEventListener(type, (e) => onCaption(e) && e.stopImmediatePropagation(), true);
  }

  // 悬停暂停：只是路过就在离开时继续播放；选中了文字则保持暂停，由用户自己恢复
  let hovering = false;
  let pausedByUs = false;
  document.addEventListener("mouseover", (e) => {
    const over = onCaption(e);
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
