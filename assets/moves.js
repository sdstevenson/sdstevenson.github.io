/* Selecting a move in the list shows the hangar layout after that move. */
(function () {
  document.querySelectorAll('[data-moves]').forEach(function (root) {
    var images = Array.prototype.slice.call(root.querySelectorAll('.moves_map img'));
    var buttons = Array.prototype.slice.call(root.querySelectorAll('.moves_item'));
    var active = 0;

    function show(index) {
      active = index;
      images.forEach(function (image, i) { image.classList.toggle('is-active', i === index); });
      buttons.forEach(function (button, i) {
        button.classList.toggle('is-active', i === index);
        button.setAttribute('aria-pressed', i === index ? 'true' : 'false');
      });
    }

    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () { show(index); });
    });
    root.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      var next = Math.min(buttons.length - 1, Math.max(0, active + (event.key === 'ArrowDown' ? 1 : -1)));
      if (next === active) return;
      event.preventDefault();
      show(next);
      buttons[next].focus();
    });
  });
})();
