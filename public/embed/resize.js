(function () {
  // Child frame sends heights ≥ EMBED_IFRAME_MIN_REPORTED_HEIGHT_PX (see src/lib/embed/widget-frame.ts).
  var iframe = document.getElementById('reserveni-widget');
  if (!iframe) return;

  window.addEventListener('message', function (event) {
    if (
      event.data &&
      event.data.type === 'reserve-ni-height' &&
      typeof event.data.height === 'number'
    ) {
      iframe.style.height = event.data.height + 'px';
    }
  });
})();
