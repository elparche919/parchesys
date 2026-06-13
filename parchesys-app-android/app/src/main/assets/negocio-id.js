/// negocio-id.js
// Utility to get the current negocio (business) ID from URL or localStorage.
// This ensures consistent propagation of the negocio ID across the MODUSFOOD modules.

/**
 * Retrieves the negocio ID.
 * - Checks the URL query parameter 'negocio'.
 * - Falls back to localStorage value 'negocioID'.
 * - If found in URL, stores it in localStorage for future pages.
 * @returns {string} The negocio ID string, or an empty string if not set.
 */
function getNegocioId() {
  const params = new URLSearchParams(window.location.search);
  let negocio = params.get('negocio');
  if (negocio) {
    // Store in localStorage for subsequent pages.
    localStorage.setItem('negocioID', negocio);
    return negocio;
  }
  // Fallback to stored value.
  negocio = localStorage.getItem('negocioID') || '';
  return negocio;
}

/**
 * Updates all sidebar navigation links that require the negocio ID.
 * It finds anchors with an id starting with 'link-' and ensures the href contains the negocio ID.
 */
function propagateNegocioLinks() {
  const negocio = getNegocioId();
  if (!negocio) return; // No negocio to propagate.
  const links = document.querySelectorAll('a[id^="link-"]');
  links.forEach(link => {
    // If href already contains a query string, replace the placeholder after 'negocio='.
    const href = link.getAttribute('href') || '';
    if (href.includes('negocio=')) {
      // Replace anything after 'negocio=' up to end or '&'
      const newHref = href.replace(/negocio=[^&]*/, `negocio=${encodeURIComponent(negocio)}`);
      link.setAttribute('href', newHref);
    } else if (href.includes('?')) {
      // Append parametro.
      link.setAttribute('href', `${href}&negocio=${encodeURIComponent(negocio)}`);
    } else {
      link.setAttribute('href', `${href}?negocio=${encodeURIComponent(negocio)}`);
    }
  });
}

// Execute after DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', propagateNegocioLinks);
} else {
  propagateNegocioLinks();
}

// Definir variable global negocioID para que el resto del código la pueda usar.
const negocioID = getNegocioId() || 'negocio_food_sv_demo';
window.negocioID = negocioID;
// Opcional: redirigir si aún no hay negocioID definido.
if (!negocioID) {
  // location.href = '../index.html'; // Descomentar si se desea redirección automática.
}
