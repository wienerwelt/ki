(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var siteKey = String(script.getAttribute('data-site-key') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(siteKey)) return;
  var instanceId = 'mobiliti-assistant-' + siteKey;
  if (document.getElementById(instanceId + '-button')) return;
  var baseUrl = new URL(script.src).origin;
  var label = String(script.getAttribute('data-label') || 'Fragen').slice(0, 40);
  var configuredColor = String(script.getAttribute('data-color') || '');
  var buttonColor = /^#[0-9a-f]{6}$/i.test(configuredColor) ? configuredColor : '#e30613';

  var button = document.createElement('button');
  button.id = instanceId + '-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Digitalen Assistenten öffnen');
  button.textContent = '✦ ' + label;
  Object.assign(button.style, {
    position: 'fixed', right: '22px', bottom: '22px', zIndex: '2147483000',
    border: '0', borderRadius: '999px', padding: '13px 18px', cursor: 'pointer',
    background: buttonColor, color: '#fff', font: '700 15px/1.2 Arial, sans-serif',
    boxShadow: '0 12px 32px rgba(0,0,0,.24)'
  });

  var frame = document.createElement('iframe');
  frame.id = instanceId + '-frame';
  frame.src = baseUrl + '/assistant/' + encodeURIComponent(siteKey);
  frame.title = 'Digitaler Assistent';
  frame.setAttribute('loading', 'lazy');
  frame.setAttribute('referrerpolicy', 'strict-origin');
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
  Object.assign(frame.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483001',
    width: '390px', height: 'min(590px, calc(100vh - 36px))', maxWidth: 'calc(100vw - 24px)',
    border: '0', borderRadius: '18px', display: 'none', background: '#fff',
    boxShadow: '0 18px 54px rgba(0,0,0,.28)'
  });

  button.addEventListener('click', function () {
    frame.style.display = 'block';
    button.style.display = 'none';
  });
  window.addEventListener('message', function (event) {
    if (event.origin !== baseUrl || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === 'mobiliti-assistant-close') {
      frame.style.display = 'none';
      button.style.display = 'block';
      button.focus();
    }
  });

  var mount = function () {
    if (!document.body || document.getElementById(button.id)) return;
    document.body.appendChild(button);
    document.body.appendChild(frame);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}());
