(function () {
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
