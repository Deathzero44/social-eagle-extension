(() => {
  const protocolFrame = document.createElement("iframe");
  protocolFrame.id = "open-eagle-iframe";
  protocolFrame.src = "eagle://open";
  protocolFrame.name = "frame";
  protocolFrame.style.cssText = "width:0;height:0;opacity:0;border:0";
  document.body.appendChild(protocolFrame);
})();
